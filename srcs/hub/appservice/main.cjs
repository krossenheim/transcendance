"use strict";
const axios = require("axios");
const { httpStatus } = require("/appservice/httpStatusEnum.cjs");
const {
  g_myContainerName,
  containersNameToIp,
  containersIpToName,
} = require("/appservice/container_names.cjs");
const { ClientRequest } = require("/appservice/client_request.cjs");
const { MessageFromService } = require("/appservice/api_message.cjs");

// Maps holding user to websocket and containername to websocket relationships
const openSocketToUserID = new Map();
const openUserIdToSocket = new Map();
const interContainerWebsocketsToName = new Map();
const interContainerNameToWebsockets = new Map();

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

function parse_websocket_message(message, socket) {
  console.log("Parsing wsm: " + message);
  // Implement your message parsing logic here

  let jsonOut;
  try
  {
    jsonOut = JSON.parse(message);
  }
  catch (e)
  {
    console.log("Couldn't parse:" +message);
    return ;
  }
  const endpoint = jsonOut.endpoint;
  if (!endpoint) socket.send({ error: "No endpoint specified in message" });
  const payload = jsonOut.payload;

  let newEndpoint, targetContainer;
  if (endpoint.startsWith("/api/public/")) {
    targetContainer = endpoint.split("/")[3];
    newEndpoint = "/api/public/" + endpoint.split("/").slice(4).join("/");
  } else {
    targetContainer = endpoint.split("/")[2];
    newEndpoint = "/api/" + endpoint.split("/").slice(3).join("/");
  }
  const clientRequest = new ClientRequest(
    newEndpoint,
    payload,
    socket.user_id,
    targetContainer
  );
  return clientRequest;
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
        socket.send("WELCOME SOCKET!");
        console.log("Added user id " + connectionCounttempid + " socket map.");
        connectionCounttempid++;
      }

      socket.on("message", async (message) => {
        try {
          const request = parse_websocket_message(message, socket);
          if (!request.endpoint.startsWith("/api/public/")) {
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
          }

          let uuser_id = openSocketToUserID.get(socket).user_id;
          request.user_id = uuser_id;

          request.printInfo();
          if (!containersNameToIp.has(request.targetContainer)) {
            socket.send(
              JSON.stringify({
                error:
                  'Invalid container name "' +
                  request.targetContainer +
                  '" in endpoint for target: ' +
                  request.targetContainer,
              })
            );
            return;
          }

          const wsToContainer = interContainerNameToWebsockets.get(
            request.targetContainer
          );
          if (!wsToContainer) {
            throw new Error(
              "Socket to reach container name " +
                request.targetContainer +
                " is not listed as ever having opened."
            );
          }
          console.log(
            "sending to " +
              request.targetContainer +
              ": " +
              JSON.stringify(request)
          );
          wsToContainer.send(JSON.stringify(request));
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

async function proxyRequest(req, reply, method, url) {
  console.log(`Proxying ${method} request to: ${url}`);
  console.log(req.headers);
  console.log(req.body);
  console.log(req.query);
  try {
    const response = await axios({
      method,
      url,
      headers: {
        ...req.headers,
        host: undefined,
        connection: undefined,
      },
      data: req.body,
      params: req.query,
      validateStatus: () => true,
    });
    reply.code(response.status).send(response.data);
  } catch (error) {
    console.error("Error proxying request:", error);
    reply.code(500).send({ error: "Internal Server Error: " + error.message });
  }
}

// Inter container below

const subscriptions = new Map();
// subscriptions[container name here] = user ids to notify of online status changes
for (const key of Object.keys(containersNameToIp)) {
  subscriptions[key] = 0;
  // 0 For no one, 1 for everyone, list for specific users
}

async function subscribe_online_status_handler(subscriptionRequestBody) {
  if (subscriptionRequestBody.subscribe === undefined) {
    console.error(
      "No subscription request in subscriptionRequestBody from " +
        subscriptionRequestBody.containerFrom
    );
    return new MessageFromService(
      httpStatus.BAD_REQUEST,
      null,
      "subscribe_online_status",
      {
        error: "No subscription request",
      }
    );
  }

  if (Array.isArray(subscriptionRequestBody.subscribe)) {
    let bool_was_modified = false;
    const current_val = subscriptions[subscriptionRequestBody.containerFrom];
    if (current_val === 1)
      return new MessageFromService(
        httpStatus.OK,
        null,
        "subscribe_online_status",
        {
          message: "Already subscribed to all users",
        }
      );
    if (!Array.isArray(current_val))
      subscriptions[subscriptionRequestBody.containerFrom] = [];

    if (subscriptionRequestBody.replace) {
      subscriptions[subscriptionRequestBody.containerFrom] =
        subscriptionRequestBody.subscribe;
    } else {
      for (const user_id of subscriptionRequestBody.subscribe) {
        if (
          subscriptions[subscriptionRequestBody.containerFrom].includes(user_id)
        )
          continue;
        subscriptions[subscriptionRequestBody.containerFrom].push(user_id);
        bool_was_modified = true;
      }
    }
    const httpStatusToReturn = bool_was_modified
      ? httpStatus.OK
      : httpStatus.ALREADY_REPORTED;
    const message = bool_was_modified
      ? "Subscribed to specific users"
      : "No new users were added to subscription list";
    console.log(
      "Subscriptions for " +
        subscriptionRequestBody.containerFrom +
        " now: " +
        subscriptions[subscriptionRequestBody.containerFrom]
    );
    return new MessageFromService(
      httpStatusToReturn,
      null,
      "subscribe_online_status",
      {
        message,
      }
    );
  } else if (subscriptionRequestBody.subscribe === "ALL") {
    subscriptions[subscriptionRequestBody.containerFrom] = 1;
    return new MessageFromService(
      httpStatus.OK,
      null,
      "subscribe_online_status",
      {
        message: "Subscribed to all users",
      }
    );
  } else if (subscriptionRequestBody.subscribe === "NONE") {
    subscriptions[subscriptionRequestBody.containerFrom] = 0;
    return new MessageFromService(
      httpStatus.OK,
      null,
      "subscribe_online_status",
      {
        message: "Unsubscribed from all users",
      }
    );
  } else {
    console.error(
      "Invalid subscription request in subscriptionRequestBody from " +
        subscriptionRequestBody.containerFrom
    );
    return new MessageFromService(
      httpStatus.BAD_REQUEST,
      null,
      "subscribe_online_status",
      {
        error: "Invalid subscription request",
      }
    );
  }
}

async function unsubscribe_online_status_handler(subscriptionRequestBody) {
  if (subscriptionRequestBody.subscribe === undefined) {
    console.error(
      "No subscription request in subscriptionRequestBody from " +
        subscriptionRequestBody.containerFrom
    );
    return new MessageFromService(
      httpStatus.BAD_REQUEST,
      null,
      "unsubscribe_online_status",
      {
        error: "No subscription request",
      }
    );
  }

  if (Array.isArray(subscriptionRequestBody.subscribe)) {
    if (!Array.isArray(subscriptions[subscriptionRequestBody.containerFrom]))
      return new MessageFromService(
        httpStatus.BAD_REQUEST,
        null,
        "unsubscribe_online_status",
        {
          error: "No specific users subscribed",
        }
      );

    for (const user_id of subscriptionRequestBody.subscribe) {
      const index =
        subscriptions[subscriptionRequestBody.containerFrom].indexOf(user_id);
      if (index < 0)
        return new MessageFromService(
          httpStatus.BAD_REQUEST,
          null,
          "unsubscribe_online_status",
          {
            error:
              "User id " +
              user_id +
              " not found in subscription list of " +
              subscriptionRequestBody.containerFrom,
          }
        );
      subscriptions[subscriptionRequestBody.containerFrom].splice(index, 1);
    }

    return new MessageFromService(
      httpStatus.OK,
      null,
      "unsubscribe_online_status",
      {
        message: "Unsubscribed from specific users",
      }
    );
  } else if (subscriptionRequestBody.subscribe === "ALL") {
    subscriptions[subscriptionRequestBody.containerFrom] = 0;
    return new MessageFromService(
      httpStatus.OK,
      null,
      "unsubscribe_online_status",
      {
        message: "Unsubscribed from all users",
      }
    );
  } else {
    console.error(
      "Invalid subscription request in subscriptionRequestBody from " +
        subscriptionRequestBody.containerFrom
    );
    return new MessageFromService(
      httpStatus.BAD_REQUEST,
      null,
      "unsubscribe_online_status",
      {
        error: "Invalid subscription request",
      }
    );
  }
}

const tasksForHub = {
  SUBSCRIBE_ONLINE_STATUS: {
    url: "/inter_api/subscribe_online_status",
    handler: subscribe_online_status_handler,
    method: "POST",
  },
  UNSUBSCRIBE_ONLINE_STATUS: {
    url: "/inter_api/unsubscribe_online_status",
    handler: unsubscribe_online_status_handler,
    method: "POST",
  },
};

async function proxyMessageToService(messageFromService) {
  Object.setPrototypeOf(messageFromService, MessageFromService);
  for (const [task_name, task] of tasksForHub) {
    if (messageFromService.endpoint !== task.url) continue;

    console.log(
      "Running task '" + task_name + "', " + messageFromService.toString()
    );
    const result = await task.handler(messageFromService);
    if (!result) {
      console.error(
        "Result for url/endpoint handler returned falsy value:'" + result + "'"
      );
      break;
    }
    const socketToService = interContainerNameToWebsockets.get(containerName);
    if (!socketToService) {
      console.error(
        "Socket to container_name:'" +
          containerName +
          "' isn't in our Map() of known services."
      );
      break;
    }
    console.log("Sent message: " + messageFromService.toString());
    socketToService.send(result);
    break;
  }
}
async function proxyMessageToUsers(messageFromService) {
  const recipients = messageFromService.recipients;
  delete messageFromService.recipients;
  for (const user_id of recipients || []) {
    const socketToUser = openUserIdToSocket.get(user_id);
    if (socketToUser) {
      console.log(
        "Sending to userID:" +
          user_id +
          "message:" +
          JSON.stringify(messageFromService)
      );
      socketToUser.send(
        "container '" +
          messageFromService.containerFrom +
          "' sent out:" +
          JSON.stringify(messageFromService)
      );
    }
    // inform container that whatever
  }
}

fastify.register(async function () {
  fastify.post("/inter_api/subscribe_online_status", async (req, reply) => {
    const customMessage = req.body;
    customMessage.containerFrom = containersIpToName.get(
      req.socket.remoteAddress.startsWith("::ffff:")
        ? req.socket.remoteAddress.slice(7)
        : req.socket.remoteAddress
    );
    const result = subscribe_online_status_handler(customMessage);
    reply.code(result.httpStatus).send(result);
  });

  fastify.post("/inter_api/unsubscribe_online_status", async (req, reply) => {
    const customMessage = req.body;
    customMessage.containerFrom = containersIpToName.get(
      req.socket.remoteAddress.startsWith("::ffff:")
        ? req.socket.remoteAddress.slice(7)
        : req.socket.remoteAddress
    );
    const result = unsubscribe_online_status_handler(customMessage);
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
        socket.send(
          "Goodbye, unauthorized container (Couldnt determine the name of address: '" +
            req.socket.remoteAddress +
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
        console.log("Received on inter_api: " + ws_input);
        let messageFromService;
        try {
          const parsed = JSON.parse(ws_input);
          Object.setPrototypeOf(parsed, MessageFromService.prototype);
          messageFromService = parsed;
          messageFromService.containerFrom = containerName;
          console.log(messageFromService);
        } catch (e) {
          console.error("Exception parsing message, ignoring the gabagool");
          return;
        }
        if (true && true && true && "so_true") {
          // Wee woo debug
          for (const [_socketToUser, user_id] of openSocketToUserID) {
            console.log(
              "Sending DEBUG userID:" +
                user_id +
                "message:" +
                JSON.stringify(messageFromService)
            );
            _socketToUser.send(
              "DEBUG, container '" +
                containerName +
                "' sent out:" +
                JSON.stringify(messageFromService)
            );
          }
        }
        if (messageFromService.isForHub()) {
          await proxyMessageToService(messageFromService);
        } else if (messageFromService.isForUsers()) {
          await proxyMessageToUsers(messageFromService);
        } else {
          console.error(
            "A message wasn't meant for hub or users, message was:\n" + message
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
      // MessageFromService
      // Chatroom says to container/userlist in MessageFromService send payload in MessageFromService
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
