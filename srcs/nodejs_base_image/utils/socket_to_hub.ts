import WebSocket from "ws";
import { ForwardToContainerSchema } from "./api/service/hub/hub_interfaces.js";
import { rawDataToString } from "./raw_data_to_string.js";
import { user_url } from "./api/service/common/endpoints.js";
import { zodParse } from "./api/service/common/zodUtils.js";
import { Result } from "./api/service/common/result.js";
import type { WebSocketRouteDef } from "./api/service/common/endpoints.js";
import { z } from "zod";
import type {
  T_ForwardToContainer,
  T_PayloadToUsers,
} from "./api/service/hub/hub_interfaces.js";
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
import type { ErrorResponseType } from "./api/service/common/error.js";

interface HandlerType<TBody = any, TWrapper = any> {
  handler: (
    wrapper: TWrapper
  ) => Promise<Result<T_PayloadToUsers | null, ErrorResponseType>>;
  metadata: {
    schema: {
      body: ZodType<TBody>;
      wrapper: ZodType<TWrapper>;
    };
  } & Omit<WebSocketRouteDef, "schema">; // keep other metadata fields
}

import { ZodType } from "zod";
export class OurSocket {
  private socket: WebSocket;
  private container: string;
  private handlers: Record<string, HandlerType>;

  constructor(socket: WebSocket, container: string) {
    this.socket = socket;
    this.container = container;
    this.handlers = {};
    this.handleSocketCallbackMethods();
  }

  async _runEndpointHandler(
    wrapper: T_ForwardToContainer,
    handler: (wrapper: T_ForwardToContainer) => any | Promise<any>
  ): Promise<Result<T_PayloadToUsers | null, ErrorResponseType>> {
    try {
      if (handler.constructor.name === "AsyncFunction") {
        return await handler(wrapper);
      } else {
        return handler(wrapper);
      }
    } catch {
      return Result.Err({ message: "Error executing ws endpoint" });
    }
  }

  async _handleEndpoint(
    wrapper: T_ForwardToContainer
  ): Promise<Result<T_PayloadToUsers | null, ErrorResponseType>> {
    const handlerType: HandlerType | undefined = this.handlers[wrapper.funcId];
    // console.log(this.handlers);
    if (handlerType === undefined)
      return Result.Err({
        message: "No handler found for this endpoint:" + wrapper.funcId,
      });

    // const parsedBodyResult = zodParse(handlerType.metadata.schema.body, containerSchema.payload)

    const parseResult = handlerType.metadata.schema.body.safeParse(
      wrapper.payload
    );
    if (!parseResult.success) {
      return Result.Ok({
        recipients: [wrapper.user_id],
        funcId: wrapper.funcId,
        code: -1, // INVALID_SCHEMA_CODE
        payload: {
          message: `Validation error: ${parseResult.error.message}`,
        },
      });
    }
    wrapper.payload = parseResult.data; // coerce numbers and the like.
    const funcOutput = await this._runEndpointHandler(
      wrapper,
      handlerType.handler
    );
    return funcOutput;
  }

  handleSocketCallbackMethods() {
    this.socket.on("message", async (data: WebSocket.RawData) => {
      console.log("New data yay");
      let parsed: null | object;
      try {
        parsed = JSON.parse(rawDataToString(data) || "");
      } catch {
        console.log("Wrong user input...");
        return;
      }

      const schemaResult = zodParse(ForwardToContainerSchema, parsed);
      if (schemaResult.isOk()) {
        const request = schemaResult.unwrap();
        console.log("Handling request for funcID: " + request.funcId);
        const result = await this._handleEndpoint(request);
        if (result.isErr()) {
          console.warn("Handler returns error!");
          console.warn(result.unwrapErr());
          return;
        }
        const handlerOutput: T_PayloadToUsers | null = result.unwrap();
        if (handlerOutput === null) {
          console.log("No reply from handler, request was: ", request);
          return;
        }
        console.log("Proxying to ", JSON.stringify(handlerOutput));
        const serialized = JSON.stringify(handlerOutput);
        console.log(`Proxying to ${process.env.HUB_NAME}: ${serialized}`);
        this.socket.send(serialized);
      } else {
        console.log("Wrong user input...");
      }
    });
  }

  registerEvent<T extends WebSocketRouteDef>(
    handlerEndpoint: T,
    handler: T["schema"]["body"] extends z.ZodTypeAny
      ? (
          wrapper: z.infer<T["schema"]["wrapper"]>
        ) => Promise<Result<T_PayloadToUsers | null, ErrorResponseType>>
      : () => Promise<Result<T_PayloadToUsers | null, ErrorResponseType>>
  ) {
    if (handlerEndpoint.container != this.container) {
      console.log(
        `Tried adding a route for container ${handlerEndpoint.container} to the websocket class for ${this.container}`
      );
      throw Error(
        `Tried adding a route for container ${handlerEndpoint.container} to the websocket class for ${this.container}`
      );
    }
    this.handlers[handlerEndpoint.funcId] = {
      metadata: handlerEndpoint,
      handler: handler,
    };
  }
}

// const socket = new OurSocket(socketToHub, 'chat');

// socket.registerEvent(user_url.ws.chat.sendMessage, async (body: z.infer<typeof user_url.ws.chat.sendMessage.schema.body>) => {
// 	console.log("Yay I registered an event and Im kindah praying it works rn");
// });
