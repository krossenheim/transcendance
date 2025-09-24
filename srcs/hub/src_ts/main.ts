// server.ts
import Fastify from "fastify";
import websocketPlugin from "@fastify/websocket";
// Type-only imports
import type { FastifyInstance, FastifyRequest } from "fastify";
import type WebSocket from "ws";
import {
  UserRequestSchema,
  UserAuthenticationRequestSchema,
  PayloadToUsersSchema,
  ForwardToContainerSchema,
} from "./utils/api/service/hub_interfaces.js";
import { containersIpToName } from "./utils/container_names.js";
import { rawDataToString } from "./utils/raw_data_to_string.js";
import z from "zod";

const fastify: FastifyInstance = Fastify();

// Register the WebSocket plugin
await fastify.register(websocketPlugin);

const openSocketToUserID = new Map(); 
const openUserIdToSocket = new Map();
let connectionCounttempid = 1;

function list_new_connection(socket: WebSocket) {
  if (!openSocketToUserID.has(socket)) {
    openSocketToUserID.set(socket, connectionCounttempid);
    openUserIdToSocket.set(connectionCounttempid, socket);
    socket.send(JSON.stringify({ user_id: connectionCounttempid }));
    console.log("Added user id " + connectionCounttempid + " socket map.");
    connectionCounttempid++;
  }
}

const authenticatedSockets = new Map();

function authenticate(ws_parsed: any) {
  // const user_authentication_request = UserAuthenticationRequest.safeParse(ws_parsed);
  // if (!user_authentication_request)
  //   return (false);
  return true;
}

function disconnectSocket(socket: WebSocket) {
  if (socket.readyState <= 1) {
    socket.close();
  }
  authenticatedSockets.delete(socket);
  let socket_id: number;
  socket_id = openSocketToUserID.get(socket);
  if (socket_id > 0) openUserIdToSocket.delete(socket_id);
  openSocketToUserID.delete(socket);
}

const interContainerWebsocketsToName = new Map();
const interContainerNameToWebsockets = new Map();

function forwardToContainer(
  target_container: string,
  forwarded: z.infer<typeof ForwardToContainerSchema>
) {
  const parsed = ForwardToContainerSchema.safeParse(forwarded);
  if (!parsed.success) {
    console.log("Validation failed!");

    // Print detailed error
    console.log(parsed.error);
    // or more readable:
    console.log(parsed.error);
    throw new Error("Invalid parameter to forward to container.");
  }
  const wsToContainer = interContainerNameToWebsockets.get(target_container);
  if (!wsToContainer) {
    console.log(target_container + " has not opened a socket.");
    throw new Error("Socket to container not launched.");
  }
  forwarded.endpoint = forwarded.endpoint.replace(`/${target_container}/`, "/");
  console.log(
    "sending to " + target_container + ": " + JSON.stringify(forwarded)
  );
  wsToContainer.send(JSON.stringify(forwarded));
}

const returnType = {
  UNKNOWN: -1,
  ADDED: 0,
  NOT_CHANGED: 1,
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
  if (!interContainerNameToWebsockets.has(containerName)) {
    interContainerNameToWebsockets.set(containerName, socket);
    interContainerWebsocketsToName.set(socket, containerName);
    console.log("Socket from " + containerName + " established.");
    return returnType.NOT_CHANGED;
  }
  return returnType.ADDED;
}

function debugMessageToAllUserSockets(message: any) {
  console.log(`message all users: ${message})`);
  for (const [user_id, socket] of openUserIdToSocket) {
    if (socket.readyState == socket.CLOSED) {
      console.log("you should clean up closed sockets.");
    }
    socket.send(message);
  }
}

function forwardPayloadToUsers(recipients: number[], payload: object) {
  if (!payload) {
    console.log(`attempted to forward empty payload to users:${recipients}`);
    return;
  }
  for (const user_id of recipients) {
    // Crash if its not iterable. its either an list with 0 to n users, a SYS user
    const socketToUser = openUserIdToSocket.get(user_id);
    if (!socketToUser) {
      debugMessageToAllUserSockets("Clean dead ws? ID Was: " + user_id);
      continue;
    }
    if (socketToUser)
      console.log(
        "Sending to userID:" + user_id + "message:" + JSON.stringify(payload)
      );
    socketToUser.send(JSON.stringify(payload));
  }
}

fastify.get(
  "/inter_api",
  { websocket: true },
  (socket: WebSocket, req: FastifyRequest) => {
    if (listIncomingContainerWebsocket(socket, req) == returnType.UNKNOWN) {
      console.log("Unknown remote.");
      return;
    }
    socket.on("message", (message: WebSocket.RawData) => {
      let parsed;
      try {
        const str = rawDataToString(message);
        if (!str) {
          console.log("Empty message from $( some info here )");
          return;
        }
        debugMessageToAllUserSockets(message);
        parsed = JSON.parse(str);
      } catch (e) {
        console.log("Unrecognized message from $( some info here )");
        return;
      }
      const passToUsers = PayloadToUsersSchema.safeParse(parsed);
      if (passToUsers.success) {
        forwardPayloadToUsers(parsed.recipients, parsed.payload);
        return;
      }

      console.log("Unhandled input, input was: " + rawDataToString(message));
      throw new Error("Unhandled input.");
      // const passToContainers = ContainerRequestSchema.safeParse(parsed);
      // if both, error. one or the other.
    });

    socket.on("close", () => {
      console.log(`Service disconnected:${interContainerWebsocketsToName.get(socket)}`);
    });
  }
);

type T_ForwardToContainer = z.infer<typeof ForwardToContainerSchema>;

fastify.get(
  "/ws",
  { websocket: true },
  (socket: WebSocket, req: FastifyRequest) => {
    list_new_connection(socket);
    socket.on("message", (message: WebSocket.RawData) => {
      let parsed: any;
      try {
        const str = rawDataToString(message);
        if (!str) {
          console.log("Empty message from $( some info here )");
          return;
        }
        parsed = JSON.parse(str);
      } catch (e) {
        console.log("Unrecognized message from $( some info here )");
        return;
      }
      const socket_id = openSocketToUserID.get(socket);
      const has_logged_in = authenticatedSockets.has(socket_id);

      const { endpoint, ...payload } = parsed;
      console.log("Endpoint: " + endpoint);
      let target_container;
      if (!endpoint.startsWith("/api/public/") && !has_logged_in) {
        target_container = endpoint.split("/")[2];
        if (!authenticate) {
          socket.send("authenticate before using non public features.");
          disconnectSocket(socket);
          return;
        }
      } else {
        target_container = endpoint.split("/")[3];
      }
      const request: T_ForwardToContainer = {
        payload: payload,
        endpoint: endpoint,
        user_id: socket_id,
        target_container: target_container,
      };

      const user_request_parse = ForwardToContainerSchema.safeParse(request);
      if (!user_request_parse.success) {
        console.log("Invalid request: " + JSON.stringify(parsed));
        const userauth_attempt =
          UserAuthenticationRequestSchema.safeParse(parsed);
        if (!userauth_attempt) {
          socket.send(
            "Greetings from debug land, your message was not one of userschema or userauthenticatiornequest"
          );
          disconnectSocket(socket);
          return;
        }
        if (authenticate(userauth_attempt)) {
          socket.send("Happy auth to you.");
          return;
        }
        return;
      }
      forwardToContainer(target_container, request);
    });

    socket.on("close", () => {
      disconnectSocket(socket);
    });
  }
);

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
