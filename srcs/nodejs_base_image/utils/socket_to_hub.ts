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
    body: TBody,
    wrapper: TWrapper
  ) => Promise<Result<any, ErrorResponseType>>;
  metadata: {
    schema: {
      body: ZodType<TBody>;
      wrapper: ZodType<TWrapper>;
    };
  } & Omit<WebSocketRouteDef, "schema">; // keep other metadata fields
}

import { ZodType } from "zod";
import { parse } from "path";
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
    payload: z.ZodType,
    wrapper: T_ForwardToContainer,
    handler: (
      input: any,
      wrapper: T_ForwardToContainer
    ) => T_PayloadToUsers | Promise<T_PayloadToUsers>
  ): Promise<Result<z.ZodType, ErrorResponseType>> {
    try {
      if (handler.constructor.name === "AsyncFunction") {
        return Result.Ok(await handler(payload, wrapper));
      } else {
        return Result.Ok(handler(payload, wrapper));
      }
    } catch {
      return Result.Err({ message: "Error executing ws endpoint" });
    }
  }

  async _handleEndpoint(
    containerSchema: z.infer<typeof ForwardToContainerSchema>
  ): Promise<Result<z.ZodType, ErrorResponseType>> {
    const handlerType: HandlerType | undefined =
      this.handlers[containerSchema.funcId];
    console.log(this.handlers);
    if (handlerType === undefined)
      return Result.Err({
        message: "No handler found for this endpoint:" + containerSchema.funcId,
      });

    // const parsedBodyResult = zodParse(handlerType.metadata.schema.body, containerSchema.payload)

    const parseResult = handlerType.metadata.schema.body.safeParse(
      containerSchema.payload
    );
    if (parseResult.success === false)
      return Result.Err({ message: "Cry hard:" + parseResult.error.message });
    return await this._runEndpointHandler(
      parseResult.data,
      containerSchema,
      handlerType.handler
    );
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
        console.log(
          "Try find something for endpoint " + schemaResult.unwrap().funcId
        );
        const result = await this._handleEndpoint(schemaResult.unwrap());
        if (result.isErr()) console.log(result.unwrapErr());
      } else {
        console.log("Wrong user input...");
      }
    });
  }

  registerEvent<T extends WebSocketRouteDef>(
    handlerEndpoint: T,
    handler: T["schema"]["body"] extends z.ZodTypeAny
      ? (
          body: z.infer<T["schema"]["body"]>,
          wrapper: z.infer<T["schema"]["wrapper"]>
        ) => Promise<Result<any, ErrorResponseType>>
      : () => Promise<Result<any, ErrorResponseType>>
  ) {
    if (handlerEndpoint.container != this.container)
      throw `Tried adding a route for container ${handlerEndpoint.container} to the websocket class for ${this.container}`;
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
