import { ForwardToContainerSchema } from "./api/service/hub/hub_interfaces.js";
import { zodParse } from "./api/service/common/zodUtils.js";
import { rawDataToString } from "./raw_data_to_string.js";
import { JSONtoZod } from "./api/service/common/json.js";
import { Result } from "./api/service/common/result.js";

import type { T_ForwardToContainer, T_PayloadToUsers } from "./api/service/hub/hub_interfaces.js";
import type { WebSocketRouteDef } from "./api/service/common/endpoints.js";
import type { ErrorResponseType } from "./api/service/common/error.js";

import WebSocket from "ws";
import { z, ZodType } from "zod";

type WSHandlerReturnValue<T extends Record<number, z.ZodTypeAny>> = {
  recipients: number[];
  code: keyof T;
  payload: z.infer<T[keyof T]>;
};

interface HandlerType<
  TBody extends ZodType = any,
  TWrapper extends ZodType = any,
  TResponse extends Record<number, ZodType> = any
> {
  handler: (
    wrapper: z.infer<TWrapper>
  ) => Promise<Result<WSHandlerReturnValue<TResponse> | null, ErrorResponseType>>;

  metadata: Omit<WebSocketRouteDef, "schema"> & {
    schema: {
      body: TBody;
      wrapper: TWrapper;
      response: TResponse;
    };
  };
}

export class OurSocket {
  private socket: WebSocket;
  private container: string;
  private handlers: Record<string, HandlerType> = {};

  constructor(container: string) {
    this.container = container;
    this.socket = new WebSocket(
      `ws://${process.env.HUB_NAME}:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS}/inter_api`
    );

    this._setupSocketListeners();
  }

  registerEvent<T extends WebSocketRouteDef>(
    handlerEndpoint: T,
    handler: (
      body: Omit<z.infer<T["schema"]["wrapper"]>, "payload"> & {
        payload: z.infer<T["schema"]["body"]>;
      }
    ) => Promise<Result<WSHandlerReturnValue<T["schema"]["response"]> | null, ErrorResponseType>>
  ) {
    if (handlerEndpoint.container !== this.container) {
      throw new Error(
        `Cannot register route for container "${handlerEndpoint.container}" on "${this.container}"`
      );
    }

    this.handlers[handlerEndpoint.funcId] = {
      metadata: handlerEndpoint,
      handler,
    };
  }

  getSocket(): WebSocket {
    return this.socket;
  }

  private _setupSocketListeners() {
    this.socket.on("message", async (data: WebSocket.RawData) => {
      const str = rawDataToString(data);
      if (!str) return;

      const parsedData = JSONtoZod(str, ForwardToContainerSchema);
      if (parsedData.isErr()) {
        console.warn("Schema validation failed for incoming WS payload: " + parsedData.unwrapErr());
        return;
      }

      const request = parsedData.unwrap();
      const result = await this._handleEndpoint(request);

      if (result.isErr()) {
        console.warn("Handler error:", result.unwrapErr());
        return;
      }

      const handlerOutput = result.unwrap();
      if (!handlerOutput) return;

      const serialized = JSON.stringify(handlerOutput);
      console.log(`Proxying to ${process.env.HUB_NAME}: ${serialized}`);
      this.socket.send(serialized);
    });

    this.socket.on("error", (err: Error) => {
      console.error("WebSocket error:", err.message);
    });
  }

  // -----------------------------
  // Endpoint handling
  // -----------------------------
  private async _handleEndpoint(
    containerSchema: z.infer<typeof ForwardToContainerSchema>
  ): Promise<Result<T_PayloadToUsers | null, ErrorResponseType>> {
    const handlerType = this.handlers[containerSchema.funcId];
    if (!handlerType)
      return Result.Err({message: `No handler found for funcId "${containerSchema.funcId}"`});

    const parsedBody = zodParse(handlerType.metadata.schema.body, containerSchema.payload);
    if (parsedBody.isErr())
      return Result.Err({message: `Validation error: ${parsedBody.unwrapErr()}`});

    const funcOutput = await this._executeHandler(
      containerSchema,
      handlerType.handler
    );

    if (funcOutput.isErr()) return Result.Err(funcOutput.unwrapErr());

    const data = funcOutput.unwrap();
    if (!data) return Result.Ok(null);

    return Result.Ok({
      recipients: data.recipients,
      funcId: containerSchema.funcId,
      code: data.code,
      payload: data.payload,
    });
  }

  private async _executeHandler(
    payload: T_ForwardToContainer,
    handler: (
      body: T_ForwardToContainer
    ) => Promise<Result<WSHandlerReturnValue<any> | null, ErrorResponseType>> | Result<WSHandlerReturnValue<any> | null, ErrorResponseType>
  ): Promise<Result<T_PayloadToUsers | null, ErrorResponseType>> {
    try {
      let result = handler(payload);
      if (result instanceof Promise) result = await result;

      return result.map((res) => {
        if (!res) return null;
        return {
          recipients: res.recipients,
          funcId: payload.funcId,
          code: Number(res.code),
          payload: res.payload,
        };
      });
    } catch (err) {
      return Result.Err({ message: "Error executing WS endpoint" });
    }
  }
}
