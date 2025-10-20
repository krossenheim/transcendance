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

type WSHandlerReturnValue<
  T extends Record<number, z.ZodTypeAny>
> = {
  recipients: number[];
} & {
  [K in keyof T]: { code: K; payload: z.infer<T[K]> }
}[keyof T];

import { ZodType } from "zod";

export class OurSocket {
  private socket: WebSocket;
  private container: string;
  private handlers: Record<string, HandlerType>;

  constructor(container: string) {
    this.socket = new WebSocket(
      "ws://" +
      process.env.HUB_NAME +
      ":" +
      process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS +
      "/inter_api"
    );

    this.container = container;
    this.handlers = {};
    this.handleSocketCallbackMethods();
  }

  async _runEndpointHandler(
    payload: z.ZodType,
    wrapper: T_ForwardToContainer,
    handler: (input: any, wrapper: any) => any | Promise<any>
  ): Promise<Result<T_PayloadToUsers | null, ErrorResponseType>> {
    try {
      if (handler.constructor.name === "AsyncFunction") {
        return await handler(payload, wrapper);
      } else {
        return handler(payload, wrapper);
      }
    } catch {
      return Result.Err({ message: "Error executing ws endpoint" });
    }
  }

  async _handleEndpoint(
    containerSchema: z.infer<typeof ForwardToContainerSchema>
  ): Promise<Result<T_PayloadToUsers | null, ErrorResponseType>> {
    const handlerType: HandlerType | undefined =
      this.handlers[containerSchema.funcId];
    console.log(this.handlers);
    if (handlerType === undefined)
      return Result.Err({
        message: "No handler found for this endpoint:" + containerSchema.funcId,
      });

    const parsedBodyResult = zodParse(handlerType.metadata.schema.body, containerSchema.payload)

    const parseResult = handlerType.metadata.schema.body.safeParse(
      containerSchema.payload
    );
    if (!parseResult.success) {
      return Result.Ok({
        recipients: [containerSchema.user_id],
        funcId: containerSchema.funcId,
        payload: {
          message: `Validation error: ${parseResult.error.message}`,
        },
      });
    }
    const funcOutput = await this._runEndpointHandler(
      parseResult.data,
      containerSchema,
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
        console.log("Try find something for endpoint " + request.funcId);
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
        console.log("Sending to hub:", JSON.stringify(handlerOutput));
        this.socket.send(JSON.stringify(handlerOutput));
      } else {
        console.log("Wrong user input...");
      }
    });

    this.socket.on("error", (err: Error) => {
      console.error("Error:", err);
    });
  }

  registerEvent<T extends WebSocketRouteDef>(
    handlerEndpoint: T,
    handler: T["schema"]["body"] extends z.ZodTypeAny
      ? (
        body: Omit<z.infer<T["schema"]["wrapper"]>, "payload"> & {payload: z.infer<T["schema"]["body"]>}
      ) => Promise<Result<WSHandlerReturnValue<T["schema"]["response"]> | null, ErrorResponseType>>
      : () => Promise<Result<WSHandlerReturnValue<T["schema"]["response"]> | null, ErrorResponseType>>
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

  getSocket(): WebSocket {
    return this.socket;
  }
}

// const socket = new OurSocket(socketToHub, 'chat');

// socket.registerEvent(user_url.ws.chat.sendMessage, async (body: z.infer<typeof user_url.ws.chat.sendMessage.schema.body>) => {
// 	console.log("Yay I registered an event and Im kindah praying it works rn");
// });
