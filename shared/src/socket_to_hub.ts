import { InferWSHandlerBody, WSHandlerReturnValue, createResponseBuilder, ResponseBuilder } from "@app/shared/websocketResponse";
import { zodParse } from "@app/shared/api/service/common/zodUtils";
import { rawDataToString } from "@app/shared/raw_data_to_string";
import { Result } from "@app/shared/api/service/common/result";
import {
  type T_PayloadToUsers,
  PayloadToUsersSchema,
} from "@app/shared/api/service/hub/hub_interfaces";
import type { WebSocketRouteDef } from "@app/shared/api/service/common/endpoints";
import {
  ErrorResponse,
  type ErrorResponseType,
} from "@app/shared/api/service/common/error";

import WebSocket from "ws";
import { z, ZodType } from "zod";


type InferWSHandler<T extends WebSocketRouteDef> = (
  body: InferWSHandlerBody<T>,
  response: ResponseBuilder<T>
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

// Type definitions for handler storage
interface HandlerCallable {
  metadata: WebSocketRouteDef;
  handler: InferWSHandler<WebSocketRouteDef>;
}

interface ReceiverCallable {
  metadata: WebSocketRouteDef;
  handler: InferWSReceiver<WebSocketRouteDef>;
}

// Configuration constants
const MAX_MESSAGE_QUEUE_SIZE = 100;
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

export class OurSocket {
  private socket: WebSocket;
  private container: string;
  private handlerCallables: Record<string, HandlerCallable> = {};
  private receiverCallables: Record<string, ReceiverCallable> = {};
  private messageStack: Array<string> = [];
  private lastReconnectTime: number = 0;
  private reconnectAttempts: number = 0;

  constructor(container: string) {
    this.container = container;
    this.socket = this._connectToHub();
  }

  async invokeHandler<T extends WebSocketRouteDef>(
    handlerEndpoint: T,
    userId: number | number[],
    payload: z.infer<T["schema"]["args"]>
  ): Promise<Result<void, ErrorResponseType>> {
    if (handlerEndpoint.container !== this.container) {
      console.log(`Invoking handler on different container "${handlerEndpoint.container}" from "${this.container}"`);
      const userIdValue = userId instanceof Array ? userId : [userId];
      this._sendMessageToHub({
        isInvokeMethod: true,
        target_container: handlerEndpoint.container,
        funcId: handlerEndpoint.funcId,
        userIds: userIdValue,
        payload,
      });
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
      this._sendMessageToHub(result.unwrap());
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
      handler: handler as unknown as InferWSHandler<WebSocketRouteDef>,
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

    (this.receiverCallables[handlerEndpoint.funcId] = {
      metadata: handlerEndpoint,
      handler: handler as unknown as InferWSReceiver<WebSocketRouteDef>,
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
      this._sendMessageToHub(rawData);
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
      createResponseBuilder(handler.metadata, inputSchemaResult.unwrap())
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
      this._sendMessageToHub({
        recipients: [userId],
        funcId: funcId,
        code: -1,
        payload: executionResult.unwrapErr(),
      });
      return Result.Err({ message: "Handler error" });
    }

    this._sendMessageToHub(executionResult.unwrap());
    return Result.Ok(undefined);
  }

  private _sendMessageToHub(data: unknown): void {
    const messageString = JSON.stringify(data);
    if (this.socket.readyState === WebSocket.OPEN) {
      console.log("Sending WS message to hub:", messageString);
      try {
        this.socket.send(messageString);
      } catch (error) {
        console.error("Failed to send message to hub:", error);
        this._queueMessage(messageString);
      }
    } else {
      this._queueMessage(messageString);
    }
  }

  private _queueMessage(messageString: string): void {
    // Enforce message queue size limit to prevent memory issues
    if (this.messageStack.length >= MAX_MESSAGE_QUEUE_SIZE) {
      console.warn(`Message queue full (${MAX_MESSAGE_QUEUE_SIZE}), dropping oldest message`);
      this.messageStack.shift();
    }
    console.log("Socket not open, stacking message:", messageString);
    this.messageStack.push(messageString);
  }

  private _connectToHub(): WebSocket {
    console.log("Connecting to hub...");
    const socket = new WebSocket(`ws://${process.env.HUB_NAME}:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS}/inter_api`);

    socket.on("message", async (data: WebSocket.RawData) => {
      const result = await this._handleOnMessage(data);
      if (result.isErr()) {
        console.error(
          "Error handling incoming WS message:",
          result.unwrapErr()
        );
        return;
      }
    });

    socket.on("error", (err: Error) => {
      console.error("WebSocket error:", err.message);
    });

    socket.on("close", (code: number, reason: Buffer) => {
      console.error("Connection to hub closed: ", code, reason.toString());
      
      // Exponential backoff for reconnection
      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
        return;
      }
      
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts),
        MAX_RECONNECT_DELAY_MS
      );
      
      this.reconnectAttempts++;
      console.log(`Reconnecting to hub in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      
      setTimeout(() => {
        this.lastReconnectTime = Date.now();
        this.socket = this._connectToHub();
      }, delay);
      console.log(`Last reconnect time set to ${this.lastReconnectTime}`);
    });

    socket.on("open", () => {
      console.log("WebSocket connection to hub established");
      // Reset reconnect attempts on successful connection
      this.reconnectAttempts = 0;
      
      // Flush queued messages
      const messagesToSend = [...this.messageStack];
      this.messageStack = [];
      
      for (const message of messagesToSend) {
        console.log("Sending stacked message to hub:", message);
        try {
          this.socket.send(message);
        } catch (error) {
          console.error("Failed to send queued message:", error);
          // Re-queue failed messages
          this._queueMessage(message);
        }
      }
    });

    return socket;
  }

  register(func: (socket: OurSocket) => void): void {
    func(this);
  }
}
