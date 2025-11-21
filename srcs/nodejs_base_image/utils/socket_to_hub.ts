import { zodParse } from "./api/service/common/zodUtils.js";
import { rawDataToString } from "./raw_data_to_string.js";
import { Result } from "./api/service/common/result.js";

import {
  type T_PayloadToUsers,
  PayloadToUsersSchema,
} from "./api/service/hub/hub_interfaces.js";
import type { WebSocketRouteDef } from "./api/service/common/endpoints.js";
import {
  ErrorResponse,
  type ErrorResponseType,
} from "./api/service/common/error.js";

import WebSocket from "ws";
import { z, ZodType } from "zod";

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
  Result<WSHandlerReturnValue<T["schema"]["output"]> | null, ErrorResponseType>
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
  input: WSReceiverInputValue<T["schema"]["output"]>,
  schema: T["schema"]
) => Promise<Result<null, string>>;

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

  async invokeHandler<T extends WebSocketRouteDef>(
    handlerEndpoint: T,
    userId: number | number[],
    payload: z.infer<T["schema"]["args"]>
  ): Promise<Result<void, ErrorResponseType>> {
    if (handlerEndpoint.container !== this.container) {
      console.log(`Invoking handler on different container "${handlerEndpoint.container}" from "${this.container}"`);
      const userIdValue = userId instanceof Array ? userId : [userId];
      this.socket.send(JSON.stringify({
        isInvokeMethod: true,
        target_container: handlerEndpoint.container,
        funcId: handlerEndpoint.funcId,
        userIds: userIdValue,
        payload,
      }));
      return Result.Ok(undefined);
    }

    if (userId instanceof Array) {
      const results = await Promise.all(
        userId.map((id) => this.invokeHandler(handlerEndpoint, id, payload))
      );
      const firstErr = results.find((r) => r.isErr());
      if (firstErr !== undefined) return firstErr;
      return Result.Ok(undefined);
    }

    const handler = this.handlerCallables[handlerEndpoint.funcId];
    if (handler === undefined)
      return Promise.resolve(
        Result.Err({
          message: `No handler found for funcId "${handlerEndpoint.funcId}"`,
        })
      );

    return this._handleHandlerEndpoint(handler, {
      funcId: handlerEndpoint.funcId,
      user_id: userId,
      payload,
    }).then((result) => {
      if (result.isErr()) return Result.Err(result.unwrapErr());
      this.socket.send(JSON.stringify(result.unwrap()));
      return Result.Ok(undefined);
    });
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

    if (
      this.handlerCallables[handlerEndpoint.funcId] ||
      this.receiverCallables[handlerEndpoint.funcId]
    ) {
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

    const result = (this.receiverCallables[handlerEndpoint.funcId] = {
      metadata: handlerEndpoint,
      handler,
    });
  }

  private _constructWSHandlerOutput<T extends WebSocketRouteDef>(
    route: T,
    response: WSHandlerReturnValue<T["schema"]["output"]>
  ): Result<T_PayloadToUsers | null, ErrorResponseType> {
    if (!response) {
      console.debug(
        "Handler returns null. This is fine, it means it does not directly return a response for a client."
      );
      return Result.Ok(null);
    }
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
          console.error(
            `Response payload does not match schema for code ${responseCode}: ${validation.unwrapErr()}`
          );
          return Result.Err({
            message: "Internal schema mismatch - failed payload parsing",
          });
        }
        break;
      }
    }

    if (!matched)
      return Result.Err({
        message: "Internal schema mismatch - undefined code",
      });

    return zodParse(PayloadToUsersSchema, {
      recipients: response.recipients,
      funcId: route.funcId,
      code: responseCode,
      payload: response.payload,
    }).mapErr((err) => {
      console.warn(err);
      return { message: "Internal schema mismatch - failed schema parsing" };
    });
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
      rawData
    );
    if (parseResult.isErr()) return Result.Err(parseResult.unwrapErr());

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

  private async _executeHandler(
    handler: any,
    ...args: any[]
  ): Promise<Result<any, ErrorResponseType>> {
    try {
      let result = handler.handler(...args);
      if (result instanceof Promise) result = await result;
      return result;
    } catch (err) {
      return Result.Err({ message: `Error running handler: ${err}` });
    }
  }

  private async _handleHandlerEndpoint(
    handler: any,
    rawJson: any
  ): Promise<Result<T_PayloadToUsers | null, ErrorResponseType>> {
    const inputSchemaResult = zodParse(
      handler.metadata.schema.args_wrapper.extend({
        payload: handler.metadata.schema.args,
      }),
      rawJson
    );
    if (inputSchemaResult.isErr()) {
      console.error(
        "Input schema validation failed:",
        inputSchemaResult.unwrapErr()
      );
      return Result.Err(
        ErrorResponse.parse({
          message: `Invalid input: ${inputSchemaResult.unwrapErr()}`,
        })
      );
    }

    const handlerResult = await this._executeHandler(
      handler,
      inputSchemaResult.unwrap(),
      handler.metadata.schema
    );
    if (handlerResult.isErr()) {
      console.error("Handler execution failed:", handlerResult.unwrapErr());
      return Result.Err(
        ErrorResponse.parse({ message: "Handler execution failed" })
      );
    }

    return this._constructWSHandlerOutput(
      handler.metadata,
      handlerResult.unwrap()
    );
  }

  private async _handleReceiverEndpoint(
    handler: any,
    rawJson: any
  ): Promise<Result<void, ErrorResponseType>> {
    const inputSchemaResult = zodParse(
      handler.metadata.schema.output_wrapper,
      rawJson
    );
    if (inputSchemaResult.isErr()) {
      console.error(
        "Input schema validation failed:",
        inputSchemaResult.unwrapErr()
      );
      return Result.Err(
        ErrorResponse.parse({
          message: `Invalid input schema: ${inputSchemaResult.unwrapErr()}`,
        })
      );
    }

    const schema = inputSchemaResult.unwrap();
    const code: number = Number(schema.code);
    const schemaEntry = Object.values(handler.metadata.schema.output).find(
      (entry: any) => Number(entry.code) === code
    );
    if (schemaEntry === undefined || schemaEntry === null)
      return Result.Err(
        ErrorResponse.parse({
          message: `No schema found for output code: ${code}`,
        })
      );

    const payloadSchema = (schemaEntry as { payload: z.ZodTypeAny }).payload;
    const outputSchemaResult = zodParse(
      handler.metadata.schema.output_wrapper.extend({ payload: payloadSchema }),
      rawJson
    );
    if (outputSchemaResult.isErr())
      return Result.Err(
        ErrorResponse.parse({
          message: `Invalid output: ${outputSchemaResult.unwrapErr()}`,
        })
      );

    return (
      await this._executeHandler(
        handler,
        outputSchemaResult.unwrap(),
        handler.metadata.schema
      )
    ).map(() => undefined);
  }

  private async _handleOnMessage(
    data: WebSocket.RawData
  ): Promise<Result<void, ErrorResponseType>> {
    const str = rawDataToString(data);
    if (!str)
      return Result.Err({ message: "Failed to convert WS data to string" });
    console.log("Received WS message:", str);

    let rawJson;
    try {
      rawJson = JSON.parse(str);
    } catch (error) {
      console.error("Failed to parse incoming WS payload:", error);
      return Result.Err({ message: "Failed to parse incoming WS payload" });
    }

    const parsedData = zodParse(z.object({ funcId: z.string() }), rawJson);
    if (parsedData.isErr()) {
      console.warn(
        "Schema validation failed for incoming WS payload: " +
          parsedData.unwrapErr()
      );
      return Result.Err({
        message: "Schema validation failed for incoming WS payload",
      });
    }

    const funcId = parsedData.unwrap().funcId;
    const receiverCallable = this.receiverCallables[funcId];
    if (receiverCallable !== undefined) {
      console.log("Awaiting handler to deal with:" + str);
      const executionResult = await this._handleReceiverEndpoint(
        receiverCallable,
        rawJson
      );
      if (executionResult.isErr()) {
        console.warn("Receiver handler error:", executionResult.unwrapErr());
        return Result.Err({ message: "Receiver handler error" });
      }
      return executionResult;
    }

    const handleCallable = this.handlerCallables[funcId];
    if (handleCallable === undefined) {
      console.warn(`No handler found for funcId "${funcId}"`);
      return Result.Err({ message: `No handler found for funcId "${funcId}"` });
    }

    const executionResult = await this._handleHandlerEndpoint(
      handleCallable,
      rawJson
    );
    if (executionResult.isErr()) {
      console.warn("Handler error:", executionResult.unwrapErr());
      const userIdResult = zodParse(z.object({ user_id: z.number() }), rawJson);
      if (userIdResult.isErr()) return Result.Err({ message: "Handler error" });

      const userId = userIdResult.unwrap().user_id;
      this.socket.send(
        JSON.stringify({
          recipients: [userId],
          funcId: funcId,
          code: -1,
          payload: executionResult.unwrapErr(),
        })
      );
      return Result.Err({ message: "Handler error" });
    }

    const serialized = JSON.stringify(executionResult.unwrap());
    this.socket.send(serialized);
    return Result.Ok(undefined);
  }

  private _setupSocketListeners() {
    this.socket.on("message", async (data: WebSocket.RawData) => {
      const result = await this._handleOnMessage(data);
      if (result.isErr()) {
        console.error(
          "Error handling incoming WS message:",
          result.unwrapErr()
        );
        return;
      }
    });

    this.socket.on("error", (err: Error) => {
      console.error("WebSocket error:", err.message);
    });
  }

  register(func: (socket: OurSocket) => void) {
    func(this);
  }
}
