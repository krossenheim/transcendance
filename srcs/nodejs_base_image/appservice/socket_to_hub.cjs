const { g_myContainerName } = require('/appservice/container_names.cjs');

const WebSocket = require("ws");
const socketToHub = new WebSocket(
  "ws://" + process.env.HUB_NAME + ":" + process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS + "/inter_api"
);

socketToHub.on("open", () => {
  console.log(g_myContainerName + ":Websocket connection open");
  socketToHub.send(g_myContainerName + ":Websocket connection open");
});

socketToHub.on("close", () => {
  console.log(g_myContainerName + ":Websocket connection closed");
});

socketToHub.on("error", (err) => {
  console.error("Error:", err);
});

function isAsync(fn) {
  console.log("Functions may or may not be async, fix it to make them all awaitable and get rid of this annoying log message.\n:)\n\n:)!")
  return fn.constructor.name === "AsyncFunction";
}

function setSocketOnMessageHandler(socket, { tasks }) {
  socket.on("message", async (data) => {
    let clientRequest;
    try {
      clientRequest = JSON.parse(data);
    } catch (e) {
      console.log(
        `Couldnt parse to json:${data}`
      );
      return;
    }

    for (const taskKey in tasks) {
      if (tasks[taskKey].url === clientRequest.endpoint) {
        console.log("Executing task handler for: " + taskKey);
        let result;
        const handler = tasks[taskKey].handler;

        if (isAsync(handler)) {
          result = await handler(clientRequest);
        } else {
          result = handler(clientRequest);
        }

        if (result === undefined) {
          console.log("Handler did not return a value: " + taskKey);
        }

        socket.send(JSON.stringify(result));
        return;
      }
    }
    console.log(
      "No matching task for URL:",
      clientRequest.endpoint,
    );
    socket.send(JSON.stringify({error : "Unknown endpoint: " + clientRequest.endpoint}));
  });
}

module.exports = { socketToHub, setSocketOnMessageHandler};