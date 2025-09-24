// server.ts
import Fastify from "fastify";
import websocketPlugin from "@fastify/websocket";
// Type-only imports
import type { FastifyInstance, FastifyRequest } from "fastify";
import type WebSocket from "ws";
import {
  UserRequestSchema,
  UserAuthenticationRequest,
} from "./utils/api/service/hub_interfaces.js";
import { containersIpToName } from "./utils/container_names.js";

const fastify: FastifyInstance = Fastify();

// Register the WebSocket plugin
await fastify.register(websocketPlugin);

const openSocketToUserID = new Map();
const openUserIdToSocket = new Map();

function list_new_connection(socket: WebSocket) {
  let connectionCounttempid = 1;
  if (!openSocketToUserID.has(socket)) {
    openSocketToUserID.set(socket, connectionCounttempid);
    openUserIdToSocket.set(connectionCounttempid, socket);
    socket.send(JSON.stringify({ user_id: connectionCounttempid }));
    console.log("Added user id " + connectionCounttempid + " socket map.");
    connectionCounttempid++;
  }
}

function rawDataToString(data: WebSocket.RawData): string | undefined {
  if (typeof data === "string") {
    return data;
  } else if (data instanceof Buffer) {
    return data.toString();
  } else if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString();
  } else if (Array.isArray(data)) {
    return Buffer.concat(data).toString();
  }
  console.error("Unknown message type");
  return undefined;
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
function forwardToContainer(target_container: string, parsed: any) {
  const wsToContainer = interContainerNameToWebsockets.get(target_container);
  if (!wsToContainer) {
    throw new Error(target_container + " has not opened a socket.");
  }
  console.log("sending to " + target_container + ": " + JSON.stringify(parsed));
  wsToContainer.send(JSON.stringify(parsed));
}


const returnType = {
  UNKNOWN: -1,
  ADDED: 0,
  NOT_CHANGED: 1,
} as const;

// Type of all values: -1 | 0 | 1
type ReturnType = typeof returnType[keyof typeof returnType];

function listIncomingContainerWebsocket(socket: WebSocket, req: FastifyRequest) : ReturnType {
  const incoming_ipv4_address =  req.ip.startsWith("::ffff:")
      ? req.ip.slice(7)
      : req.socket.remoteAddress;
  const containerName = containersIpToName.get(incoming_ipv4_address);
  if (containerName === undefined) {
    socket.send("Goodbye, unauthorized");
    console.error(
      "Undefined container name, socket address was: " +
        req.ip +
        " parsed into : '" +
        incoming_ipv4_address +
        "'"
    );
    socket.close(1008, "Unauthorized container");
    return (returnType.UNKNOWN);
  }

  // handle reconnections here.
  if (!interContainerNameToWebsockets.has(containerName)) {
    interContainerNameToWebsockets.set(containerName, socket);
    interContainerWebsocketsToName.set(socket, containerName);
    console.log("Socket from " + containerName + " established.");
    return (returnType.NOT_CHANGED);
  }
  return (returnType.ADDED);
}

fastify.get(
  "/inter_api",
  { websocket: true },
  (socket: WebSocket, req: FastifyRequest) => {
    if (listIncomingContainerWebsocket(socket, req) == returnType.UNKNOWN)
    {
      console.log("Unknown remote.");
      return ;
    }
    socket.on("message", (message: WebSocket.RawData) => {
      const parsed = JSON.parse(message)
      const containerRequest = ContainerRequestSchema(parsed); 
     });

    socket.on("close", () => {
      console.log("Client disconnected");
    });
  }
);

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
          console.error("Empty message from $( some info here )");
          return;
        }
        parsed = JSON.parse(str);
      } catch (e) {
        console.log("Unrecognized message from $( some info here )");
        return;
      }
      const socket_id = openSocketToUserID.get(socket);
      // Authenticate socket here,
      const has_logged_in = authenticatedSockets.has(socket_id);
      const userRequest = UserRequestSchema.safeParse(parsed);
      if (!userRequest.success) {
        const userAuthAttempt = UserAuthenticationRequest.safeParse(parsed);
        if (!userAuthAttempt) {
          socket.send(
            "Greetings from debug land, your message was not one of userschema or userauthenticatiornequest"
          );
          disconnectSocket(socket);
          return;
        }
        if (!authenticate(userAuthAttempt)) {
          socket.send("Invalid token");
          return;
        }
      }
      let target_container;
      if (!parsed.endpoint.startsWith("/api/public/") && !has_logged_in) {
        target_container = parsed.endpoint.split("/")[2];
        if (!authenticate) {
          socket.send("authenticate before using non public features.");
          disconnectSocket(socket);
          return;
        }
      } else {
        target_container = parsed.endpoint.split("/")[3];
      }

      forwardToContainer(target_container, parsed);

      // socket.send(JSON.stringify({ received: message }));
    });

    socket.on("close", () => {
      console.log("Client disconnected");
    });
  }
);

try {
  await fastify.listen({ port: 3000 });
  console.log("Server listening on ws://localhost:3000/ws");
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
