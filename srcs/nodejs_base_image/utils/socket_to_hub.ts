import WebSocket from "ws";
import { ForwardToContainerSchema, UserToHubSchema } from "./api/service/hub/hub_interfaces.js";
import { rawDataToString } from "./raw_data_to_string.js";
import { user_url } from "./api/service/common/endpoints.js";
import { zodParse } from "./api/service/common/zodUtils.js";
import { Result } from "./api/service/common/result.js";
import type { WebSocketRouteDef } from "./api/service/common/endpoints.js";
import { fa } from "zod/v4/locales";
import { unknown, z } from "zod";

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

type HandlerType = {
  metadata: WebSocketRouteDef;
  handler: (input: any) => any | Promise<any>;
};

class OurSocket {
  private socket: WebSocket;
  private container: string;
	private handlers: Record<string, HandlerType>;

  constructor(socket: WebSocket, container: string) {
		this.socket = socket;
		this.container = container;

		this.handleSocketCallbackMethods();
  }

	async _runEndpointHandler(payload: z.ZodType | unknown, handler: (input: any) => any | Promise<any>): Promise<Result<null, string>> {
		if (payload === unknown)
			return Result.Err("Fuck javascript :skull_crossbones:");

		try {
			if (handler.constructor.name === "AsyncFunction") {
				await handler(payload);
			} else {
				handler(payload);
			}
			return Result.Ok(null);
		} catch {
			return Result.Err("Error executing ws endpoint");
		}
	}

	async _handleEndpoint(containerSchema: z.infer<typeof ForwardToContainerSchema>): Promise<Result<null, string>> {
		const handlerType: HandlerType | undefined = this.handlers[containerSchema.funcId];
		if (handlerType === undefined)
			return Result.Err("No handler found for this endpoint");

		const parsedBodyResult = zodParse(handlerType.metadata.schema.body, containerSchema.payload)

		const parseResult = handlerType.metadata.schema.body.safeParse(containerSchema.payload);
		if (parseResult.success === false)
			return Result.Err("Cry hard");
		return await this._runEndpointHandler(parseResult.data, handlerType.handler);
	}

	handleSocketCallbackMethods() {
		this.socket.on("message", async (data: WebSocket.RawData) => {
			let parsed: null | object;
			try { parsed = JSON.parse(rawDataToString(data) || "")}
			catch {
				console.log("Wrong user input...");
				return ;
			}

			const schemaResult = zodParse(ForwardToContainerSchema, parsed);
			if (schemaResult.isOk()) {
				await this._handleEndpoint(schemaResult.unwrap());
			} else {
				console.log("Wrong user input...");
			}
		});
	}

	registerEvent<T extends WebSocketRouteDef>(
		handlerEndpoint: T,
		handler: T["schema"]["body"] extends z.ZodTypeAny
			? (body: z.infer<T["schema"]["body"]>) => unknown | Promise<unknown>
			: () => unknown | Promise<unknown>
	) {
		if (handlerEndpoint.container != this.container)
			throw (`Tried adding a route for container ${handlerEndpoint.container} to the websocket class for ${this.container}`)
		this.handlers[handlerEndpoint.funcId] = { metadata: handlerEndpoint, handler: handler };
	}
}

const socket = new OurSocket(socketToHub, 'chat');

socket.registerEvent(user_url.ws.chat.sendMessage, async (body: z.infer<typeof user_url.ws.chat.sendMessage.schema.body>) => {
	console.log("Yay I registered an event and Im kindah praying it works rn");
});

// export function setSocketOnMessageHandler(
//   socket: WebSocket,
//   params: { tasks: any }
// ) {
//   const { tasks } = params;
//   socket.on("message", async (data: WebSocket.RawData) => {
//     let parsed: any;
//     let messageString = rawDataToString(data);
//     if (!messageString) {
//       console.log("Couldnt turn input to string.");
//       throw Error("Die! Misconfigured tasks.");
//     }
//     try {
//       parsed = JSON.parse(messageString);
//       console.log("Parsed:" + JSON.stringify(parsed));
//       console.log("Parsed:" + messageString);
//     } catch (e) {
//       console.log(`Couldnt parse to json:${data}`);
//       return;
//     }
//     const validation = ForwardToContainerSchema.safeParse(parsed);
//     if (!validation) {
//       console.log(`Bad input from container, input was ${messageString}`);
//       return;
//     }
//     for (const taskKey in tasks) {
//       if (tasks[taskKey].funcId === parsed.funcId) {
//         console.log("Executing task handler for: " + taskKey);
//         let result;
//         const handler = tasks[taskKey].handler;

//         if (isAsync(handler)) {
//           result = await handler(parsed);
//         } else {
//           result = handler(parsed);
//         }

//         if (result === undefined) {
//           console.log("Handler did not return a value: " + taskKey);
//         }

//         socket.send(JSON.stringify(result));
//         return;
//       }
//     }
//     console.log("No matching task for URL:", parsed.funcId);
//     // socket.send(
//     //   JSON.stringify({ info: "No task for endpoint: " + parsed.endpoint })
//     // );
//   });
// }
