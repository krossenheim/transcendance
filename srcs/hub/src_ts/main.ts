import { AuthClientRequest } from "./utils/api/service/common/clientRequest.js";
import { containersIpToName, containersNameToIp } from "./utils/container_names.js";
import { rawDataToString } from "./utils/raw_data_to_string.js";
import { isRequestAuthenticated } from "./auth.js";
import { proxyRequest } from "./proxyRequest.js";
import { HubCTX } from "./ctx.js";
import { z } from "zod";

import websocketPlugin from "@fastify/websocket";
import Fastify from "fastify";

import type WebSocket from "ws";
import type { FastifyInstance, FastifyRequest } from "fastify";

const fastify: FastifyInstance = Fastify();
await fastify.register(websocketPlugin);

const ctx = new HubCTX();

// Whitelist of allowed container names for proxy requests
const ALLOWED_CONTAINERS = new Set([
  process.env.CHATROOM_NAME,
  process.env.DATABASE_NAME,
  process.env.AUTH_NAME,
  process.env.PONG_NAME,
  process.env.USERS_NAME,
].filter(Boolean));

function isValidContainer(containerName: string): boolean {
  return ALLOWED_CONTAINERS.has(containerName);
}

function listInternalContainerConnection(socket: WebSocket, request: FastifyRequest): string | null {
  const containerIp4 = request.ip.startsWith("::ffff:")
    ? request.ip.slice(7)
    : request.socket.remoteAddress;
  
  const containerName = containersIpToName.get(containerIp4 || "");
  if (!containerName) {
    console.error("Unknown container connected with IP: " + containerIp4);
    socket.close();
    return null;
  }

  console.log("Container connected: " + containerName);
  ctx.saveInternalContainerSocket(containerName, socket);
  return containerName;
}

fastify.get(
  "/inter_api",
  { websocket: true },
  (socket: WebSocket, req: FastifyRequest) => {
    const connectionName = listInternalContainerConnection(socket, req);
    if (connectionName === null) return;

    socket.on("close", () => {
      const internalSocket = ctx.getInternalContainerSocketByWebSocket(socket);
      if (internalSocket) {
        console.log("Container disconnected: " + internalSocket.getContainerName());
      }
    });

    socket.on("message", async (message: WebSocket.RawData) => {
      console.log("Received message from internal container:", message);
      const decodedMessage = rawDataToString(message);
      if (!decodedMessage) {
        console.error("Failed to decode message from internal container: " + message);
        return;
      }

      let internalSocket = ctx.getInternalContainerSocketByWebSocket(socket);
      if (!internalSocket) {
        console.error("Internal socket not found for container: " + connectionName);
        return;
      }

      let result = await internalSocket.handleMessage(ctx, decodedMessage);
      if (result.isErr())
        console.error("Error handling internal container message: " + result.unwrapErr());
    });
  }
);

fastify.get(
  "/ws",
  { websocket: true },
  (socket: WebSocket, req: FastifyRequest) => {
    socket.on("message", async (message: WebSocket.RawData) => {
      let decodedMessage = rawDataToString(message);
      if (!decodedMessage) return;

      let userSocket = ctx.getUserSocketBySocket(socket);
      let result = await userSocket.handleMessage(ctx, decodedMessage);
      if (result.isErr()) {
        const errMsg = result.unwrapErr();
        console.error("Error handling user socket message: " + errMsg);
        userSocket.sendHubError(errMsg, decodedMessage);
      }
    });

    socket.on("close", () => {
      ctx.disconnectUserSocket(socket);
    });
  }
);

fastify.all("/api/:container/*", async (req, reply) => {
  const authResult = await isRequestAuthenticated(req);
  if (authResult.isErr()) return reply.status(401).send(authResult.unwrapErr());
  const userId = authResult.unwrap();
  console.log("Authenticated user ID:", userId);
  const { container } = req.params as { container: string };
  
  // Validate container name to prevent SSRF attacks
  if (!isValidContainer(container)) {
    console.error("SSRF attempt blocked - invalid container:", container);
    return reply.status(400).send({ error: "Invalid container name" });
  }
  
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
  
  // Validate container name to prevent SSRF attacks
  if (!isValidContainer(container)) {
    console.error("SSRF attempt blocked - invalid container:", container);
    return reply.status(400).send({ error: "Invalid container name" });
  }
  
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
