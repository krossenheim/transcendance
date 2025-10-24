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
import { z, ZodType } from "zod";

export type WSInputHandlerReturnValue<
  T extends Record<string, { code: number; payload: z.ZodTypeAny }>
> = {
  [R in keyof T]: {
    recipients: number[];
    code: T[R]["code"];
    payload: z.infer<T[R]["payload"]>;
  };
}[keyof T];

type InferWSInputHandler<T extends WebSocketRouteDef> = (
  body: Omit<z.infer<T["schema"]["args_wrapper"]>, "payload"> & {
    payload: z.infer<T["schema"]["args"]>;
  },
  schema: T["schema"]
) => Promise<
  Result<
    WSInputHandlerReturnValue<T["schema"]["output"]> | null,
    ErrorResponseType
  >
>;

export type WSOutputHandlerInputValue<
  T extends Record<string, { code: number; payload: z.ZodTypeAny }>
> = {
  [R in keyof T]: {
    code: T[R]["code"];
    payload: z.infer<T[R]["payload"]>;
  };
}[keyof T];

// interface InputHandlerType<
//   TBody extends ZodType = any,
//   TWrapper extends T_ForwardToContainer = any,
//   TResponse extends Record<
//     string,
//     { code: number; payload: z.ZodTypeAny }
//   > = any
// > {
//   handler: (
//     body: any,
//     schema: any
//   ) => Promise<
//     Result<WSHandlerReturnValue<TResponse> | null, ErrorResponseType>
//   >;

//   metadata: Omit<WebSocketRouteDef, "schema"> & {
//     schema: {
//       args: TBody;
//       args_wrapper: TWrapper;
//       output: TResponse;
//     };
//   };
// }

export class OurSocket {
  private socket: WebSocket;
  private container: string;
  private inputHandlers: Record<string, any> = {};
  private outputHandlers: Record<string, any> = {};

  constructor(container: string) {
    this.container = container;
    this.socket = new WebSocket(
      `ws://${process.env.HUB_NAME}:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS}/inter_api`
    );

    this._setupSocketListeners();
  }

  registerEvent<T extends WebSocketRouteDef>(
    handlerEndpoint: T,
    handler: InferWSInputHandler<T>
  ) {
    if (handlerEndpoint.container !== this.container) {
      throw new Error(
        `Cannot register route for container "${handlerEndpoint.container}" on "${this.container}"`
      );
    }

    if (this.inputHandlers[handlerEndpoint.funcId] || this.outputHandlers[handlerEndpoint.funcId]) {
      throw new Error(
        `Handler for funcId "${handlerEndpoint.funcId}" is already registered`
      );
    }

    this.inputHandlers[handlerEndpoint.funcId] = {
      metadata: handlerEndpoint,
      handler,
    };
  }

  // registerOutputEvent<T extends WebSocketRouteDef>(
  //   handlerEndpoint: T,
  //   handler: WSInputHandlerReturnValue<T["schema"]["output"]>
  // ) {
  //   if (handlerEndpoint.container === this.container) {
  //     throw new Error(
  //       `Cannot register route for container "${handlerEndpoint.container}" on "${this.container}"`
  //     );
  //   }

  //   this.outputHandlers[handlerEndpoint.funcId] = {
  //     metadata: handlerEndpoint,
  //     handler,
  //   };
  // }

  sendMessage<T extends WebSocketRouteDef>(
    handlerEndpoint: T,
    message: WSInputHandlerReturnValue<T["schema"]["output"]>
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
    const parseResult = this._validateResponsePayload(
      handlerEndpoint.schema,
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

      return Result.Ok(result);
    } catch (err) {
      console.error("Error in _handleOutputEndpoint:", err);
      return Result.Err({ message: "Error handling output endpoint" });
    }
  }

  private async _handleInputEndpoint(handler: any, rawJson: any): Promise<Result<any, ErrorResponseType>> {
    const inputSchemaResult = zodParse(handler.metadata.schema.args_wrapper.extend({payload: handler.metadata.schema.args}), rawJson);
    if (inputSchemaResult.isErr())
      return Result.Err(ErrorResponse.parse({ message: `Invalid input: ${inputSchemaResult.unwrapErr()}` }));

    return await this._executeHandler(handler, inputSchemaResult.unwrap(), handler.metadata.schema);
  }

  private async _handleOutputEndpoint(handler: any, rawJson: any): Promise<Result<any, ErrorResponseType>> {
    const code: number = rawJson.code;
    const schemaEntry = Object.values(handler.metadata.schema.responses).find((entry: any) => Number(entry.code) === code);
    if (schemaEntry === undefined || schemaEntry === null)
      return Result.Err(ErrorResponse.parse({ message: `No schema found for output code: ${code}` }));

    const payloadSchema = (schemaEntry as { payload: z.ZodTypeAny }).payload;
    const outputSchemaResult = zodParse(handler.metadata.schema.output_wrapper.extend({ payload: payloadSchema }), rawJson);
    if (outputSchemaResult.isErr())
      return Result.Err(ErrorResponse.parse({ message: `Invalid output: ${outputSchemaResult.unwrapErr()}` }));

    return await this._executeHandler(handler, outputSchemaResult.unwrap(), handler.metadata.schema);
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
      const inputHandler = this.inputHandlers[funcId];
      let executionResult;
      if (inputHandler !== undefined)
        executionResult = await this._handleInputEndpoint(inputHandler, rawJson);
      else {
        const outputHandler = this.outputHandlers[funcId];
        if (outputHandler !== undefined)
          executionResult = await this._handleOutputEndpoint(outputHandler, rawJson);
        else {
          console.warn(`No handler found for funcId "${funcId}"`);
          return;
        }
      }

      if (executionResult.isErr()) {
        console.warn("Handler error:", executionResult.unwrapErr());
        return;
      }

      console.log("Response: " + executionResult.unwrap());

      // const parsedData = JSONtoZod(str, ForwardToContainerSchema);
      // if (parsedData.isErr()) {
      //   console.warn(
      //     "Schema validation failed for incoming WS payload: " +
      //       parsedData.unwrapErr()
      //   );
      //   return;
      // }

      // const request = parsedData.unwrap();
      // const result = await this._handleEndpoint(request);

      // if (result.isErr()) {
      //   console.warn("Handler error:", result.unwrapErr());

      //   return;
      // }

      // const handlerOutput = result.unwrap();
      // if (!handlerOutput) return;

      // const serialized = JSON.stringify(handlerOutput);
      // console.log(`Proxying to ${process.env.HUB_NAME}: ${serialized}`);
      // this.socket.send(serialized);
    });

    this.socket.on("error", (err: Error) => {
      console.error("WebSocket error:", err.message);
    });
  }

  // -----------------------------
  // Endpoint handling
  // -----------------------------
  private async _handleEndpoint(
    wrapped_request: z.infer<typeof ForwardToContainerSchema>
  ): Promise<Result<T_PayloadToUsers | null, ErrorResponseType>> {
    const handlerType = this.inputHandlers[wrapped_request.funcId];
    if (!handlerType)
      return Result.Err({
        message: `No handler found for funcId "${wrapped_request.funcId}"`,
      });

    const parsedBody = zodParse(
      handlerType.metadata.schema.args,
      wrapped_request.payload
    );
    if (parsedBody.isErr())
      return Result.Err({
        message: `Validation error: ${parsedBody.unwrapErr()}`,
      });
    wrapped_request.payload = parsedBody.unwrap(); // Coerced string sto int thank you Zod
    const funcOutput = await this._executeHandler(
      wrapped_request,
      handlerType.metadata.schema,
      handlerType.handler
    );

    if (funcOutput.isErr()) return Result.Err(funcOutput.unwrapErr());

    const data = funcOutput.unwrap();
    if (!data) return Result.Ok(null);

    return Result.Ok({
      recipients: data.recipients,
      funcId: wrapped_request.funcId,
      code: data.code,
      payload: data.payload,
    });
  }

  private _validateResponsePayload<T>(
    schema: any,
    outputData: T_PayloadToUsers
  ): Result<T_PayloadToUsers, ErrorResponseType> {
    let matched = false;
    for (const value of Object.values(schema.responses) as Array<{
      code: number;
      payload: ZodType;
    }>) {
      const expectedCode = Number(value.code);
      if (Number(outputData.code) === expectedCode) {
        matched = true;
        const validation = zodParse(value.payload, outputData.payload);
        if (validation.isErr()) {
          return Result.Err({
            message: `Response payload does not match schema for code ${expectedCode}: ${validation.unwrapErr()}`,
          });
        }
        break;
      }
    }
    if (!matched) {
      return Result.Err({
        message: `No response schema found for code ${outputData.code}`,
      });
    }
    return zodParse(PayloadToUsersSchema, outputData).mapErr((err) => ({
      message: err,
    }));
  }

  // private async _executeHandler(
  //   payload: T_ForwardToContainer,
  //   schema: any,
  //   handler: (
  //     body: T_ForwardToContainer,
  //     schema: WSSchemaType,
  //   ) =>
  //     | Promise<Result<WSInputHandlerReturnValue<any> | null, ErrorResponseType>>
  //     | Result<WSInputHandlerReturnValue<any> | null, ErrorResponseType>
  // ): Promise<Result<T_PayloadToUsers | null, ErrorResponseType>> {
  //   try {
  //     let result = handler(payload, schema);
  //     if (result instanceof Promise) result = await result;

  //     return result.map((res) => {
  //       if (!res) return null;
  //       return this._validateResponsePayload(schema, {
  //         recipients: res.recipients,
  //         funcId: payload.funcId,
  //         code: Number(res.code),
  //         payload: res.payload,
  //       }).unwrap();
  //     });
  //   } catch (err) {
  //     console.error("Error in _executeHandler:", err);
  //     return Result.Err({ message: "Error executing WS endpoint" });
  //   }
  // }
}
