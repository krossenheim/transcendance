import WebSocket from 'ws';

export const socketToHub = new WebSocket(
  "ws://" + process.env.HUB_NAME + ":" + process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS + "/inter_api"
);

socketToHub.on("error", (err : Error) => {
  console.error("Error:", err);
});

function isAsync(fn: (...args: any[]) => any): boolean  {
  console.log("Functions may or may not be async, fix it to make them all awaitable and get rid of this annoying log message.\n:)\n\n:)!")
  return fn.constructor.name === "AsyncFunction";
}

export function setSocketOnMessageHandler(socket: WebSocket,   params: { tasks: any }) {
  const { tasks } = params;
  socket.on("message", async (data: WebSocket.Data) => {
    let clientRequest;
	let messageString;
  if (typeof data === "string") {
    messageString = data;
  } else if (data instanceof Buffer) {
    messageString = data.toString("utf-8");
  } else if (data instanceof ArrayBuffer) {
    messageString = Buffer.from(data).toString("utf-8");
  } else if (Array.isArray(data)) {
    // If data is Buffer[], join buffers first
    messageString = Buffer.concat(data).toString("utf-8");
  } else {
    throw new Error("Unsupported message data type");
  }
    try {
      clientRequest = JSON.parse(messageString);
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
    socket.send(JSON.stringify({info : "No task for endpoint: " + clientRequest.endpoint}));
  });
}

