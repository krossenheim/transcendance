import { ForwardToContainerSchema } from "./api/service/hub/hub_interfaces.js";
import { zodParse } from "./api/service/common/zodUtils.js";
import { rawDataToString } from "./raw_data_to_string.js";
import { JSONtoZod } from "./api/service/common/json.js";
import { Result } from "./api/service/common/result.js";

import {
  type T_ForwardToContainer,
  type T_PayloadToUsers,
  PayloadToUsersSchema,
} from "./api/service/hub/hub_interfaces.js";
import type { WebSocketRouteDef, WSSchemaType } from "./api/service/common/endpoints.js";
import { ErrorResponse, type ErrorResponseType } from "./api/service/common/error.js";

import WebSocket from "ws";
import { map, z, ZodType } from "zod";

export type WSHandlerReturnValue<
  T extends Record<string, { code: number; payload: z.ZodTypeAny }>
> = {
  [R in keyof T]: {
    recipients: number[];
    code: T[R]["code"];
    payload: z.infer<T[R]["payload"]>;
  };
}[keyof T];

type InferWSHandler<T extends WebSocketRouteDef> = (
  body: Omit<z.infer<T["schema"]["args_wrapper"]>, "payload"> & {
    payload: z.infer<T["schema"]["args"]>;
  },
  schema: T["schema"]
) => Promise<
  Result<
    WSHandlerReturnValue<T["schema"]["output"]> | null,
    ErrorResponseType
  >
>;

export type WSReceiverInputValue<
  T extends Record<string, { code: number; payload: z.ZodTypeAny }>
> = {
  [R in keyof T]: {
    code: T[R]["code"];
    payload: z.infer<T[R]["payload"]>;
  };
}[keyof T];

type InferWSReceiver<T extends WebSocketRouteDef> = (
  body: Omit<z.infer<T["schema"]["output_wrapper"]>, "payload"> & {
    payload: WSReceiverInputValue<T["schema"]["output"]>;
  },
  schema: T["schema"]
) => Promise<
  Result<
    null,
    string
  >
>;

export class OurSocket {
  private socket: WebSocket;
  private container: string;
  private handlerCallables: Record<string, any> = {};
  private receiverCallables: Record<string, any> = {};

  constructor(container: string) {
    this.container = container;
    this.socket = new WebSocket(
      `ws://${process.env.HUB_NAME}:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS}/inter_api`
    );

    this._setupSocketListeners();
  }

  registerHandler<T extends WebSocketRouteDef>(
    handlerEndpoint: T,
    handler: InferWSHandler<T>
  ) {
    if (handlerEndpoint.container !== this.container) {
      throw new Error(
        `Cannot register route for container "${handlerEndpoint.container}" on "${this.container}"`
      );
    }

    if (this.handlerCallables[handlerEndpoint.funcId] || this.receiverCallables[handlerEndpoint.funcId]) {
      throw new Error(
        `Handler for funcId "${handlerEndpoint.funcId}" is already registered`
      );
    }

    this.handlerCallables[handlerEndpoint.funcId] = {
      metadata: handlerEndpoint,
      handler,
    };
  }

  registerReceiver<T extends WebSocketRouteDef>(
    handlerEndpoint: T,
    handler: InferWSReceiver<T>
  ) {
    if (handlerEndpoint.container === this.container) {
      throw new Error(
        `Cannot register receiver for container "${handlerEndpoint.container}" on itself`
      );
    }

    this.receiverCallables[handlerEndpoint.funcId] = {
      metadata: handlerEndpoint,
      handler,
    };
  }

  private _constructWSHandlerOutput<T extends WebSocketRouteDef>(
    route: T,
    response: WSHandlerReturnValue<T["schema"]["output"]>
  ): Result<T_PayloadToUsers, ErrorResponseType> {
    console.log("Constructing WS handler output:", response);
    const responseCode: number = Number(response.code);
    let matched = false;

    for (const value of Object.values(route.schema.output) as Array<{
      code: number;
      payload: ZodType;
    }>) {
      if (Number(value.code) === responseCode) {
        matched = true;
        const validation = zodParse(value.payload, response.payload);
        if (validation.isErr()) {
          return Result.Err({
            message: `Response payload does not match schema for code ${responseCode}: ${validation.unwrapErr()}`,
          });
        }
        break;
      }
    }

    if (!matched) {
      return Result.Err({
        message: `No response schema found for code ${responseCode}`,
      });
    }

    return zodParse(PayloadToUsersSchema, {
      recipients: response.recipients,
      funcId: route.funcId,
      code: responseCode,
      payload: response.payload,
    }).mapErr((err) => ({ message: err }));
  }

  sendMessage<T extends WebSocketRouteDef>(
    handlerEndpoint: T,
    message: WSHandlerReturnValue<T["schema"]["output"]>
  ): Result<void, ErrorResponseType> {
    if (handlerEndpoint.container !== this.container) {
      throw new Error(
        `Cannot send message to container "${handlerEndpoint.container}" from "${this.container}"`
      );
    }

    const rawData = {
      recipients: message.recipients,
      funcId: handlerEndpoint.funcId,
      code: Number(message.code),
      payload: message.payload,
    };
    const parseResult = this._constructWSHandlerOutput(
      handlerEndpoint,
      rawData,
    )
    if (parseResult.isErr())
      return Result.Err(parseResult.unwrapErr());
  
    try {
      this.socket.send(JSON.stringify(rawData));
    } catch (err) {
      return Result.Err({ message: "Failed to send message over WebSocket" });
    }
    return Result.Ok(undefined);
  }

  getSocket(): WebSocket {
    return this.socket;
  }

  private async _executeHandler(handler: any, ...args: any[]): Promise<Result<any, ErrorResponseType>> {
    try {
      let result = handler.handler(...args);
      if (result instanceof Promise) result = await result;
      return result;
    } catch (err) {
      console.error("Error in _handleOutputEndpoint:", err);
      return Result.Err({ message: "Error handling output endpoint" });
    }
  }

  private async _handleHandlerEndpoint(handler: any, rawJson: any): Promise<Result<T_PayloadToUsers, ErrorResponseType>> {
    const inputSchemaResult = zodParse(handler.metadata.schema.args_wrapper.extend({payload: handler.metadata.schema.args}), rawJson);
    if (inputSchemaResult.isErr())
      return Result.Err(ErrorResponse.parse({ message: `Invalid input: ${inputSchemaResult.unwrapErr()}` }));

    const handlerResult = await this._executeHandler(handler, inputSchemaResult.unwrap(), handler.metadata.schema);
    if (handlerResult.isErr())
      return Result.Err(ErrorResponse.parse({ message: `Handler execution failed: ${handlerResult.unwrapErr()}` }));

    return this._constructWSHandlerOutput(handler.metadata, handlerResult.unwrap());
  }

  private async _handleReceiverEndpoint(handler: any, rawJson: any): Promise<Result<void, ErrorResponseType>> {
    const inputSchemaResult = zodParse(handler.metadata.schema.output_wrapper, rawJson);
    if (inputSchemaResult.isErr())
      return Result.Err(ErrorResponse.parse({ message: `Invalid input schema: ${inputSchemaResult.unwrapErr()}` }));

    const schema = inputSchemaResult.unwrap();
    const code: number = Number(schema.code);
    const schemaEntry = Object.values(handler.metadata.schema.output).find((entry: any) => {console.log(entry); return Number(entry.code) === code});
    if (schemaEntry === undefined || schemaEntry === null)
      return Result.Err(ErrorResponse.parse({ message: `No schema found for output code: ${code}` }));

    const payloadSchema = (schemaEntry as { payload: z.ZodTypeAny }).payload;
    const outputSchemaResult = zodParse(handler.metadata.schema.output_wrapper.extend({ payload: payloadSchema }), rawJson);
    if (outputSchemaResult.isErr())
      return Result.Err(ErrorResponse.parse({ message: `Invalid output: ${outputSchemaResult.unwrapErr()}` }));

    return (await this._executeHandler(handler, outputSchemaResult.unwrap(), handler.metadata.schema)).map(() => undefined);
  }

  private _setupSocketListeners() {
    this.socket.on("message", async (data: WebSocket.RawData) => {
      const str = rawDataToString(data);
      if (!str) return;
      console.log("Received WS message:", str);

      let rawJson;
      try {
        rawJson = JSON.parse(str);
      } catch (error) {
        console.error("Failed to parse incoming WS payload:", error);
        return;
      }

      const parsedData = zodParse(z.object({ funcId: z.string() }), rawJson);
      if (parsedData.isErr()) {
        console.warn(
          "Schema validation failed for incoming WS payload: " +
            parsedData.unwrapErr()
        );
        return;
      }

      const funcId = parsedData.unwrap().funcId;
      const receiverCallable = this.receiverCallables[funcId];
      if (receiverCallable !== undefined) {
        const executionResult = await this._handleReceiverEndpoint(receiverCallable, rawJson);
        if (executionResult.isErr()) {
          console.warn("Receiver handler error:", executionResult.unwrapErr());
        }
        return;
      }

      const handleCallable = this.handlerCallables[funcId];
      if (handleCallable === undefined) {
        console.warn(`No handler found for funcId "${funcId}"`);
        return;
      }

      const executionResult = await this._handleHandlerEndpoint(handleCallable, rawJson);
      if (executionResult.isErr()) {
        console.warn("Handler error:", executionResult.unwrapErr());
        return;
      }

      const serialized = JSON.stringify(executionResult.unwrap());
      console.log("Sending WS response:", serialized);
      this.socket.send(serialized);
    });

    this.socket.on("error", (err: Error) => {
      console.error("WebSocket error:", err.message);
    });
  }
}
