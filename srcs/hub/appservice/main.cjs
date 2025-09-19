"use strict";
const axios = require("axios");
const { httpStatus } = require("/appservice/httpStatusEnum.cjs");
const {
  g_myContainerName,
  containersNameToIp,
  containersIpToName,
} = require("/appservice/container_names.cjs");
const {
  tasksForHub,
  servicesSubscribedToUsers,
} = require("/appservice/hub_tasks.cjs");

// Maps holding user to websocket and containername to websocket relationships
const openSocketToUserID = new Map();
const openUserIdToSocket = new Map();
const interContainerWebsocketsToName = new Map();
const interContainerNameToWebsockets = new Map();

const proxyRequest = require("/appservice/proxyRequest.cjs");

const fastify = require("fastify")({
  logger: {
    level: "info", // or 'debug' for more verbosity
    transport: {
      target: "pino-pretty", // pretty-print logs in development
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
      },
    },
  },
});

fastify.register(require("@fastify/websocket"));

function isAuthenticatedHttp(request) {
  const token = request.headers["authorization"] || null;
  const existsToken = authentication_tokenExists(token);
  return existsToken === true;
}

async function authentication_getUserIdFromToken(token) {
  try {
    const response = await axios({
      method: "GET",
      url: "/authentication_service/token_exists",
      headers: {
        host: g_myContainerName,
        connection: undefined,
      },
      data: { token: token },
      params: null,
      validateStatus: () => true,
    });
    return response.data.user_id; //verify what happens when no token-user exists
  } catch (error) {
    console.error("Error proxying request:", error);
    return undefined;
  }
}

function parseTokenFromMessage(message) {
  const msgStr = message.toString();
  if (msgStr.startsWith("Authorization: Bearer: ")) {
    const token = msgStr.split(":")[2].trim();
    return token;
  }
  return undefined;
}

function isAuthenticatedWebsocket(websocket, request, message) {
  if (websocket.user_id === undefined) {
    const token = parseTokenFromMessage(message);
    if (token) {
      websocket.user_id = authentication_getUserIdFromToken(token);
    }
  }
  return websocket.user_id !== undefined;
}

function parse_websocket_message(message) {
  let jsonOut;
  try {
    jsonOut = JSON.parse(message);
    console.log("Parsed:" + JSON.stringify(jsonOut));
  } catch (e) {
    return null;
  }
  return jsonOut;
}

function messageAuthenticatesSocket(message) {
  const token = parseTokenFromMessage(message);
  if (token) {
    const user_id = authentication_getUserIdFromToken(token);
    return user_id;
  }
  return undefined;
}

let connectionCounttempid = 1; // global counter

fastify.register(async function (instance) {
  fastify.addHook("onRequest", async (request, reply) => {
    const isWebSocket = request.raw.headers.upgrade === "websocket";
    const isPublic = request.raw.url.startsWith("/api/public/");

    if (false && !isPublic && !isWebSocket) {
      if (!isAuthenticatedHttp(request)) {
        reply
          .code(httpStatus.UNAUTHORIZED)
          .send({ error: "Unauthorized HTTP request" });
        return;
      }
    }
  });
  fastify.get("/ws", {
    handler: (req, reply) => {
      return reply.redirect(httpStatus.SEE_OTHER, "/"); // or any other appropriate action
    },
    wsHandler: (socket, req) => {
      if (!openSocketToUserID.has(socket)) {
        openSocketToUserID.set(socket, { user_id: connectionCounttempid });
        openUserIdToSocket.set(connectionCounttempid, socket);
        socket.send(JSON.stringify({ user_id: connectionCounttempid }));
        console.log("Added user id " + connectionCounttempid + " socket map.");
        connectionCounttempid++;
      }

      socket.on("message", async (message) => {
        try {
          const jsonOut = parse_websocket_message(message);
          if (!jsonOut) {
            console.log("Message cant be parsed: " + message);
            socket.send("Expected to parse message to JSON." + message);
            return;
          }
          if (!jsonOut.endpoint || !jsonOut.endpoint.startsWith("/api/")) {
            console.log("Expected endpoint field would start with /api/");
            socket.send("Expected endpoint field would start with /api/");
            return;
          }
          let target_container;
          if (!jsonOut.endpoint.startsWith("/api/public/")) {
            target_container = jsonOut.endpoint.split("/")[2];
            if (!isAuthenticatedWebsocket(socket, req, message)) {
              const user_id = messageAuthenticatesSocket(message);
              if (false && !user_id) {
                socket.send("Goodbye, unauthorized");
                socket.close(1008, "Unauthorized");
                return;
              }
              // let uuser_id = openSocketToUserID.get(socket).user_id;
              // request.user_id = uuser_id;
              // openUserIdToSocket.set(socket.user_id, socket);
            }
          } else {
            target_container = jsonOut.endpoint.split("/")[1];
          }
          if (!containersNameToIp.has(target_container)) {
            console.error(
              "Invalid container name in endpoint: " + jsonOut.endpoint
            );
            socket.send(
              JSON.stringify({
                error:
                  'Invalid container name "' +
                  target_container +
                  '" in endpoint for target: ' +
                  target_container,
              })
            );
            return;
          }
          jsonOut.endpoint = jsonOut.endpoint.replace(
            "/" + target_container,
            ""
          );
          const user_id = openSocketToUserID.get(socket).user_id;
          if (!user_id) {
            throw new Error("Wut? No user id for socket. ");
          }
          jsonOut.user_id = user_id;

          const wsToContainer =
            interContainerNameToWebsockets.get(target_container);
          if (!wsToContainer) {
            throw new Error(target_container + " has not opened a socket.");
          }
          console.log(
            "sending to " + target_container + ": " + JSON.stringify(jsonOut)
          );
          wsToContainer.send(JSON.stringify(jsonOut));
        } catch (err) {
          console.error("WebSocket message error:", err);
          socket.send(JSON.stringify({ error: err.message }));
        }
      });
    },
  }),
    fastify.all("/api/public/:dest/*", async (req, reply) => {
      const { dest } = req.params;
      const restOfUrl = req.url.replace(`${dest}/`, "");
      const url =
        `http://${dest}:` +
        process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS +
        `${restOfUrl}`;
      await proxyRequest(req, reply, req.method, url);
    });

  fastify.all("/api/:dest/*", async (req, reply) => {
    if (!isAuthenticatedHttp(req)) {
      return reply.code(httpStatus.UNAUTHORIZED);
    }
    const { dest } = req.params;
    const restOfUrl = req.url.replace(`${dest}/`, "");
    const url =
      `http://${dest}:` +
      process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS +
      `${restOfUrl}`;
    await proxyRequest(req, reply, req.method, url);
  });
});

function debugMessageToAllUserSockets(message) {
  console.log(`message all users: ${message})`);
  for (const [user_id, socket] of openUserIdToSocket) {
    if (socket.readyState == socket.CLOSED) {
      console.log("you should clean up closed sockets.");
    }
    socket.send(message);
  }
}

fastify.register(async function () {
  fastify.post("/inter_api/subscribe_online_status", async (req, reply) => {
    const { users_subscribed } = req.body;
    if (!users_subscribed) throw new Error("users_subscribed unset.");

    const container_name = containersIpToName.get(
      req.socket.remoteAddress.startsWith("::ffff:")
        ? req.socket.remoteAddress.slice(7)
        : req.socket.remoteAddress
    );
    const arguments_for_handler = {
      container_name: container_name,
      users_subscribed: users_subscribed,
    };
    const result = await tasksForHub["SUBSCRIBE_ONLINE_STATUS"].handler(
      arguments_for_handler
    );
    console.log("Result:" + result);
    reply.code(result.httpStatus).send(result);
  });

  fastify.post("/inter_api/unsubscribe_online_status", async (req, reply) => {
    const { users_unsubscribed } = req.body;
    if (!users_unsubscribed) throw new Error("users_unsubscribed unset.");

    const container_name = containersIpToName.get(
      req.socket.remoteAddress.startsWith("::ffff:")
        ? req.socket.remoteAddress.slice(7)
        : req.socket.remoteAddress
    );
    const arguments_for_handler = {
      container_name: container_name,
      users_unsubscribed: users_unsubscribed,
    };
    const result = await tasksForHub["UNSUBSCRIBE_ONLINE_STATUS"].handler(
      arguments_for_handler
    );
    console.log("Result:" + result);
    reply.code(result.httpStatus).send(result);
  });

  fastify.get("/inter_api", {
    handler: (req, reply) => {},
    wsHandler: (socket, req) => {
      if (socket.ipv6_to_ipv4_address === undefined)
        //
        socket.ipv6_to_ipv4_address = req.socket.remoteAddress.startsWith(
          "::ffff:"
        )
          ? req.socket.remoteAddress.slice(7)
          : req.socket.remoteAddress;
      const containerName = containersIpToName.get(socket.ipv6_to_ipv4_address);
      if (containerName === undefined) {
        socket.send("Goodbye, unauthorized");
        console.error(
          "Undefined container name, socket address was: " +
            req.socket.remoteAddress +
            " parsed into : '" +
            socket.ipv6_to_ipv4_address +
            "'"
        );
        socket.close(1008, "Unauthorized container");
        return;
      }

      if (!interContainerNameToWebsockets.has(containerName)) {
        interContainerNameToWebsockets.set(containerName, socket);
        interContainerWebsocketsToName.set(socket, containerName);
        console.log("Socket from " + containerName + " established.");
        socket.send(
          "Hello from " + process.env.HUB_NAME + ", " + containerName
        );
      }
      socket.on("message", async (ws_input) => {
        debugMessageToAllUserSockets(JSON.stringify({ debug: "received" + ws_input}));
        let parsed;
        try {
          parsed = JSON.parse(ws_input);
        } catch (e) {
          console.error(`Could not parse, message was: " + ${ws_input}`);
          debugMessageToAllUserSockets(JSON.stringify({ debug: "Cant parse:" + ws_input}));
          return;
        }
        const { recipients } = parsed;
        if (!Array.isArray(recipients)) {
          debugMessageToAllUserSockets(JSON.stringify({ debug: "Recipients should be array."}));
          return;
        }
        if (!recipients) {
          debugMessageToAllUserSockets(
            `Received no recipients, message was: " + ${ws_input}`
          ); // ID "SYS" ?
          return;
        }
        delete parsed.recipients;
        for (const user_id of recipients || []) {
          // Crash if its not iterable. its either an list with 0 to n users, a SYS user
          const socketToUser = openUserIdToSocket.get(user_id);
          if (!socketToUser) {
            debugMessageToAllUserSockets("Clean dead ws? ID Was: " +user_id);
            continue ;
          }
          if (socketToUser)
            console.log(
              "Sending to userID:" +
                user_id +
                "message:" +
                JSON.stringify(parsed)
            );
          socketToUser.send(
              JSON.stringify(parsed)
          );
        }
      });
      socket.on("close", (code, reason) => {
        if (!interContainerWebsocketsToName.has(containerName)) {
          return;
        }
        interContainerNameToWebsockets.delete(containerName);
        interContainerWebsocketsToName.delete(socket);
        console.log(
          "wSocket from " +
            containerName +
            " closed. Code: " +
            code +
            " Reason: " +
            reason
        );
      });
    },
  });
});

fastify.listen(
  {
    port: process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS,
    host: process.env.BACKEND_HUB_BIND_TO,
  },
  (err) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  }
);
