import type { WebSocketRouteDef, WSResponseType } from "@app/shared/api/service/common/endpoints";
import z from "zod";

export type WSHandlerReturnValue<
  T extends Record<string, WSResponseType>
> = {
  [R in keyof T]: {
    recipients: number[];
    code: T[R]["code"];
    payload: z.infer<T[R]["payload"]>;
  };
}[keyof T];

export type InferWSHandlerBody<T extends WebSocketRouteDef> = Omit<
  z.infer<T["schema"]["args_wrapper"]>,
  "payload"
> & {
  payload: z.infer<T["schema"]["args"]>;
};

export class ResponseBuilder<T extends WebSocketRouteDef> {
    private schemaMap: T;
    private userId: number;

    constructor(schemaMap: T, payload: InferWSHandlerBody<T> & { user_id: number }) {
        this.schemaMap = schemaMap;
        this.userId = payload.user_id;
    }

    public select<K extends keyof T["schema"]["output"]>(key: K) {
        const selectedSchema = this.schemaMap.schema.output[key as string]!;
        const userId = this.userId;

        return {
            replyTo(recipients: number[], payload: z.infer<T["schema"]["output"][K]["payload"]>): WSHandlerReturnValue<T["schema"]["output"]> {
                return {
                    code: selectedSchema.code,
                    payload: payload,
                    recipients: recipients,
                };
            },
            reply(payload: z.infer<T["schema"]["output"][K]["payload"]>): WSHandlerReturnValue<T["schema"]["output"]> {
                return {
                    code: selectedSchema.code,
                    payload: payload,
                    recipients: [userId],
                };
            },
        };
    }
}

export function createResponseBuilder<T extends WebSocketRouteDef>(schema: T, requestBody: InferWSHandlerBody<T> & { user_id: number }) {
    return new ResponseBuilder(schema, requestBody);
}
