// server.ts
import Fastify from "fastify";
import websocketPlugin from "@fastify/websocket";
// Type-only imports
import type { FastifyInstance, FastifyRequest } from "fastify";
import { proxyRequest } from "./proxyRequest.js";
import type WebSocket from "ws";
import {
  UserAuthenticationRequestSchema,
  PayloadToUsersSchema,
  ForwardToContainerSchema,
  UserToHubSchema,
  PayloadHubToUsersSchema,
} from "./utils/api/service/hub/hub_interfaces.js";
import { containersIpToName } from "./utils/container_names.js";
import { rawDataToString } from "./utils/raw_data_to_string.js";

import { Result } from "./utils/api/service/common/result.js";
import {
  ErrorResponse,
  type ErrorResponseType,
} from "./utils/api/service/common/error.js";
import { AuthClientRequest } from "./utils/api/service/common/clientRequest.js";
import containers from "./utils/internal_api.js";
import { z } from "zod";
import { int_url } from "./utils/api/service/common/endpoints.js"

const fastify: FastifyInstance = Fastify();

// Register the WebSocket plugin
await fastify.register(websocketPlugin);

const openSocketToUserID: Map<WebSocket, number> = new Map();
const openUserIdToSocket: Map<number, WebSocket> = new Map();

const interContainerWebsocketsToName: Map<WebSocket, string> = new Map();
const interContainerNameToWebsockets: Map<string, WebSocket> = new Map();

async function validateJWTToken(
  token: string
): Promise<Result<number, ErrorResponseType>> {
  const responseResult = await containers.auth.post(int_url.http.db.validateToken, {
    token: token,
  });

  if (responseResult.isErr())
    return Result.Err({ message: responseResult.unwrapErr() });

  const response = responseResult.unwrap();
  if (response.status === 200) {
    const userId = z.number().safeParse(response.data);
    if (!userId.success)
      return Result.Err({ message: "Auth service returned invalid data" });
    return Result.Ok(userId.data);
  }

  const errorData = ErrorResponse.safeParse(response.data);
  if (!errorData.success) {
    console.error(
      "Unexpected response from auth service:",
      response.status,
      response.data
    );
    return Result.Err({ message: "Error validating token" });
  } else return Result.Err(errorData.data);
}

async function isRequestAuthenticated(
  req: FastifyRequest
): Promise<Result<number, ErrorResponseType>> {
  const auth = req.headers.authorization;
  const jwtToken = auth && auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!jwtToken)
    return Result.Err({ message: "Missing or invalid Authorization header" });

  return await validateJWTToken(jwtToken);
}

function disconnectUserSocket(socket: WebSocket) {
  if (socket.readyState <= 1) {
    socket.close();
  }
  const user_id = openSocketToUserID.get(socket);
  if (user_id !== undefined) openUserIdToSocket.delete(user_id);
  openSocketToUserID.delete(socket);
}

function forwardToContainer(
  target_container: string,
  forwarded: z.infer<typeof ForwardToContainerSchema>
): Result<null, string> {
  const wsToContainer = interContainerNameToWebsockets.get(target_container);
  if (!wsToContainer)
    return Result.Err(target_container + " has never opened a socket.");

  if (wsToContainer.readyState !== wsToContainer.OPEN)
    return Result.Err(target_container + " socket is not open.");

  console.log(
    "sending to " + target_container + ": " + JSON.stringify(forwarded)
  );
  wsToContainer.send(JSON.stringify(forwarded));
  return Result.Ok(null);
}

const returnType = {
  UNKNOWN: -1,
  ADDED: 0,
  RECONNECTED: 1,
} as const;

// Type of all values: -1 | 0 | 1
type ReturnType = (typeof returnType)[keyof typeof returnType];

function listIncomingContainerWebsocket(
  socket: WebSocket,
  req: FastifyRequest
): ReturnType {
  const incoming_ipv4_address = req.ip.startsWith("::ffff:")
    ? req.ip.slice(7)
    : req.socket.remoteAddress;
  const containerName = containersIpToName.get(incoming_ipv4_address);
  if (containerName === undefined) {
    socket.send("Goodbye, unauthorized");
    console.log(
      "Undefined container name, socket address was: " +
        req.ip +
        " parsed into : '" +
        incoming_ipv4_address +
        "'"
    );
    socket.close(1008, "Unauthorized container");
    return returnType.UNKNOWN;
  }

  // handle reconnections here.
  if (interContainerNameToWebsockets.has(containerName)) {
    console.log("Container re-opening socket");
    interContainerNameToWebsockets.set(containerName, socket);
    interContainerWebsocketsToName.set(socket, containerName);
    return returnType.RECONNECTED;
  } else {
    interContainerNameToWebsockets.set(containerName, socket);
    interContainerWebsocketsToName.set(socket, containerName);
    console.log("Socket from " + containerName + " established.");
    return returnType.ADDED;
  }
}

function forwardPayloadToUsers(
  recipients: Array<number>,
  payload: z.infer<typeof PayloadHubToUsersSchema>
) {
  for (const user_id of recipients) {
    const socketToUser = openUserIdToSocket.get(user_id);
    if (!socketToUser) {
      console.log("No socket open to user: ", user_id);
      continue;
    }
    if (socketToUser)
      console.log(
        "Sending to userID:" + user_id + "message:" + JSON.stringify(payload)
      );
    socketToUser.send(JSON.stringify(payload));
  }
}

function translateContainerMessage(
  data: any,
  source: WebSocket
): Result<[z.infer<typeof PayloadHubToUsersSchema>, Array<number>], string> {
  const source_container = interContainerWebsocketsToName.get(source);
  if (!source_container) return Result.Err("Unknown source container");

  const validateIncoming = PayloadToUsersSchema.safeParse(data);
  if (!validateIncoming.success)
    return Result.Err(
      "Invalid payload to users schema: " + validateIncoming.error
    );

  return Result.Ok([
    PayloadHubToUsersSchema.parse({
      source_container: source_container,
      funcId: validateIncoming.data.funcId,
      payload: validateIncoming.data.payload,
    }),
    validateIncoming.data.recipients,
  ]);
}

fastify.get(
  "/inter_api",
  { websocket: true },
  (socket: WebSocket, req: FastifyRequest) => {
    socket.on("close", () => {
      const container = interContainerWebsocketsToName.get(socket);
      if (!container) {
        return;
      }
      console.log(
        `Service disconnected:${interContainerWebsocketsToName.get(socket)}`
      );
    });
    if (listIncomingContainerWebsocket(socket, req) === returnType.UNKNOWN) {
      console.log("Unrecognized container.");
      socket.close(1008, "Unauthorized container");
      return;
    }
    socket.on("message", (message: WebSocket.RawData) => {
      let parsed;
      try {
        parsed = JSON.parse(rawDataToString(message) || "");
      } catch (e) {
        console.log(`Unrecognized message: ${message}`);
        return;
      }

      const translationResult = translateContainerMessage(parsed, socket);
      if (translationResult.isErr()) {
        console.log("Invalid message format: " + translationResult.unwrapErr());
        return;
      }

      const [payload, recipients] = translationResult.unwrap();
      forwardPayloadToUsers(recipients, payload);
    });
  }
);

type T_ForwardToContainer = z.infer<typeof ForwardToContainerSchema>;

async function isAuthed(parsed: any): Promise<Result<number, string>> {
  const userauth_attempt = UserAuthenticationRequestSchema.safeParse(parsed);
  if (!userauth_attempt.success)
    return Result.Err("Invalid authentication request.");

  const token = userauth_attempt.data.authorization;
  const authResult = await validateJWTToken(token);
  if (authResult.isErr()) return Result.Err(authResult.unwrapErr().message);

  const authed_user_id = authResult.unwrap();

  return Result.Ok(authed_user_id);
}

function updateWebSocketConnection(socket: WebSocket, user_id: number) {
  if (openUserIdToSocket.has(user_id)) {
    const old_socket = openUserIdToSocket.get(user_id);
    if (old_socket && old_socket !== socket) {
      old_socket.send("You have been disconnected due to a new connection.");
      disconnectUserSocket(old_socket);
    }
  }
  openSocketToUserID.set(socket, user_id);
  openUserIdToSocket.set(user_id, socket);
}

let DEBUGUSERID = 1;

async function handleWebsocketAuth(
  socket: WebSocket,
  parsed: any
): Promise<Result<number, null>> {
  const authMessageResult = await isAuthed(parsed);
  if ( authMessageResult.isErr()
  ) {
    console.log("Websocket authentication failed: " + authMessageResult.unwrapErr());
    socket.send("Unauthorized: " + authMessageResult.unwrapErr());
    disconnectUserSocket(socket);
    return Result.Err(null);
  }

  const user_id = authMessageResult.unwrap();
  // const user_id = (DEBUGUSERID++ % 8) + 1;
  updateWebSocketConnection(socket, user_id);
  socket.send(JSON.stringify({ user_id: `Tru auth!:${user_id}` }));
  console.log("Authenticated user id " + user_id + " socket map.");
  return Result.Ok(user_id);
}

function translateUserPackage(
  data: any,
  user_id: number
): Result<[T_ForwardToContainer, string], string> {
  const validateIncoming = UserToHubSchema.safeParse(data);
  if (!validateIncoming.success)
    return Result.Err("Invalid user to hub schema: " + validateIncoming.error);

  return Result.Ok([
    ForwardToContainerSchema.parse({
      user_id: user_id,
      funcId: validateIncoming.data.funcId,
      payload: validateIncoming.data.payload,
    }),
    validateIncoming.data.target_container,
  ]);
}

fastify.get(
  "/ws",
  { websocket: true },
  (socket: WebSocket, req: FastifyRequest) => {
    socket.on("message", async (message: WebSocket.RawData) => {
      let parsed: any;
      try {
        parsed = JSON.parse(rawDataToString(message) || "");
      } catch (e) {
        console.log(`Unrecognized message: ${message}`);
        return;
      }

      let user_id = openSocketToUserID.get(socket);
      if (user_id === undefined) {
        const authResult = await handleWebsocketAuth(socket, parsed);
        if (authResult.isErr())
          console.error("Authentication failed: " + authResult.unwrapErr());
        else
          console.log(
            "User authenticated with user_id: " + authResult.unwrap()
          );
        return;
      }

      const translationResult = translateUserPackage(parsed, user_id);
      if (translationResult.isErr()) {
        socket.send("Invalid message format: " + translationResult.unwrapErr());
        return;
      }

      const [validated, target_container] = translationResult.unwrap();
      const forwardResult = forwardToContainer(target_container, validated);
      if (forwardResult.isErr())
        socket.send(
          "Failed to forward to container: " + forwardResult.unwrapErr()
        );
    });

    socket.on("close", () => {
      disconnectUserSocket(socket);
    });
  }
);

fastify.all("/api/:container/*", async (req, reply) => {
  const authResult = await isRequestAuthenticated(req);
  if (authResult.isErr()) return reply.status(401).send(authResult.unwrapErr());
  const userId = authResult.unwrap();
  console.log("Authenticated user ID:", userId);
  const { container } = req.params as { container: string };
  const body = AuthClientRequest(z.any()).parse({
    userId: Number(userId),
    payload: req.body,
  });
  await proxyRequest(
    req,
    reply,
    "POST",
    `http://${container}:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS}${req.url}`,
    body
  );
});

fastify.all("/public_api/:container/*", async (req, reply) => {
  const { container } = req.params as { container: string };
  await proxyRequest(
    req,
    reply,
    req.method,
    `http://${container}:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS}${req.url}`,
    req.body
  );
});

const port = parseInt(
  process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "no",
  10
);
const host = process.env.BACKEND_HUB_BIND_TO || "crash";

console.log(`Listening to port / host: ${port}/${host}`);
fastify.listen({ port, host }, (err, address) => {
  if (err) {
    console.log(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
