import WebSocket from "ws";
import { ForwardToContainerSchema } from "./api/service/hub/hub_interfaces.js";
import { rawDataToString } from "./raw_data_to_string.js";

export const socketToHub = new WebSocket(
  "ws://" +
    process.env.HUB_NAME +
    ":" +
    process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS +
    "/inter_api"
);

socketToHub.on("error", (err: Error) => {
  console.error("Error:", err);
});

function isAsync(fn: (...args: any[]) => any): boolean {
  console.log(
    "Functions may or may not be async, fix it to make them all awaitable and get rid of this annoying log message.\n:)\n\n:)!"
  );
  return fn.constructor.name === "AsyncFunction";
}

export function setSocketOnMessageHandler(
  socket: WebSocket,
  params: { tasks: any }
) {
  const { tasks } = params;
  socket.on("message", async (data: WebSocket.RawData) => {
    let parsed: any;
    let messageString = rawDataToString(data);
    if (!messageString) {
      console.log("Couldnt turn input to string.");
      throw Error("Die!");
    }
    try {
      parsed = JSON.parse(messageString);
      console.log("Parsed:" + JSON.stringify(parsed));
      console.log("Parsed:" + messageString);
    } catch (e) {
      console.log(`Couldnt parse to json:${data}`);
      return;
    }
    const validation = ForwardToContainerSchema.safeParse(parsed);
    if (!validation) {
      console.log(`Bad input from container, input was ${messageString}`);
      return;
    }
    for (const taskKey in tasks) {
      if (tasks[taskKey].url === parsed.funcId) {
        console.log("Executing task handler for: " + taskKey);
        let result;
        const handler = tasks[taskKey].handler;

        if (isAsync(handler)) {
          result = await handler(parsed);
        } else {
          result = handler(parsed);
        }

        if (result === undefined) {
          console.log("Handler did not return a value: " + taskKey);
        }

        socket.send(JSON.stringify(result));
        return;
      }
    }
    console.log("No matching task for URL:", parsed.funcId);
    // socket.send(
    //   JSON.stringify({ info: "No task for endpoint: " + parsed.endpoint })
    // );
  });
}
