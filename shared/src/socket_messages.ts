import { WebSocketRouteDef } from "@app/shared/api/service/common/endpoints";

import { Result } from "./api/service/common/result";
import { zodParse } from "./api/service/common/zodUtils";
import { InferWSHandlerBody } from "./websocketResponse";

import z from "zod";

const SEPARATOR = "%";

function splitHeaderData(raw_string: string): string[] {
    return raw_string.split(SEPARATOR);
}

export class ClientToHubMessage {
    private targetContainer: string;
    private funcId: string;
    private payload: string;

    constructor(targetContainer: string, funcId: string, payload: string) {
        this.targetContainer = targetContainer;
        this.funcId = funcId;
        this.payload = payload;
    }

    static fromRawString(raw_string: string): Result<ClientToHubMessage, string> {
        const parts = splitHeaderData(raw_string);
        if (parts.length < 3)
            return Result.Err("Invalid message format");

        const [targetContainer, funcId, ...json] = parts;
        const payload = json.join(SEPARATOR);
        return Result.Ok(new ClientToHubMessage(targetContainer!, funcId!, payload!));
    }

    getTargetContainer(): string {
        return this.targetContainer;
    }

    getFuncId(): string {
        return this.funcId;
    }

    getPayloadAsString(): string {
        return this.payload;
    }

    toString(): string {
        return [this.targetContainer, this.funcId, this.payload].join(SEPARATOR);
    }

    convertHubToServiceMessage(userId: string | number): HubToServiceHandlerMessage {
        return new HubToServiceHandlerMessage(this.funcId, userId.toString(), this.payload);
    }
}

enum HubToServiceMessageType {
    Handler = 0,
    Receiver = 1,
}

export abstract class HubToServiceMessage {
    static fromRawString(rawString: string): Result<HubToServiceMessage, string> {
        const parts = splitHeaderData(rawString);
        if (parts.length < 2)
            return Result.Err("Invalid message format");

        const typeString = parts[0];
        const typeNum = parseInt(typeString!, 10);
        if (isNaN(typeNum))
            return Result.Err("Invalid message type");

        switch (typeNum) {
            case HubToServiceMessageType.Handler:
                if (parts.length < 4) return Result.Err("Invalid Handler format");
                const [, funcId, userId, ...payloadParts] = parts;
                const payload = payloadParts.join(SEPARATOR);
                return Result.Ok(new HubToServiceHandlerMessage(funcId!, userId!, payload!));

            case HubToServiceMessageType.Receiver:
                if (parts.length < 5) return Result.Err("Invalid Receiver format");
                const [, rSourceContainer, rFuncId, rCode, ...rPayloadParts] = parts;
                const rPayload = rPayloadParts.join(SEPARATOR);
                return Result.Ok(new HubToServiceReceiverMessage(rSourceContainer!, rFuncId!, parseInt(rCode!, 10), rPayload!));

            default:
                return Result.Err("Unknown message type");
        }
    }

    abstract toString(): string;
}

export class HubToServiceHandlerMessageScheme<T extends WebSocketRouteDef> {
    public readonly userId: number;
    public readonly payload: InferWSHandlerBody<T>;

    constructor(userId: number, payload: InferWSHandlerBody<T>) {
        this.userId = userId;
        this.payload = payload;
    }
}

export class HubToServiceHandlerMessage extends HubToServiceMessage {
    private funcId: string;
    private userId: string;
    private payload: string;

    constructor(funcId: string, userId: string, payload: string) {
        super();

        this.funcId = funcId;
        this.userId = userId;
        this.payload = payload;
    }

    getFuncId(): string {
        return this.funcId;
    }

    getUserId(): number {
        return parseInt(this.userId, 10);
    }

    asValidated<T extends WebSocketRouteDef>(route: T): Result<HubToServiceHandlerMessageScheme<T>, string> {
        const payloadResult = zodParse(route.schema.args, this.payload);
        if (payloadResult.isErr())
            return Result.Err(payloadResult.unwrapErr());

        return Result.Ok(new HubToServiceHandlerMessageScheme<T>(parseInt(this.userId, 10), payloadResult.unwrap() as InferWSHandlerBody<T>));
    }

    toString(): string {
        return [HubToServiceMessageType.Handler.toString(), this.funcId, this.userId, this.payload].join(SEPARATOR);
    }
}

export class HubToServiceReceiverMessageScheme<T extends WebSocketRouteDef> {
    public readonly code: number;
    public readonly payload: z.infer<T["schema"]["output"][string]["payload"]>;

    constructor(code: number, payload: z.infer<T["schema"]["output"][string]["payload"]>) {
        this.code = code;
        this.payload = payload;
    }
}

export class HubToServiceReceiverMessage extends HubToServiceMessage {
    private sourceContainer: string;
    private code: number;
    private funcId: string;
    private payload: string;

    constructor(sourceContainer: string, funcId: string, code: number, payload: string) {
        super();

        this.sourceContainer = sourceContainer;
        this.code = code;
        this.funcId = funcId;
        this.payload = payload;
    }

    getFuncId(): string {
        return this.funcId;
    }

    getCode(): number {
        return this.code;
    }

    getPayloadAsString(): string {
        return this.payload;
    }

    asValidated<T extends WebSocketRouteDef>(route: T): Result<HubToServiceReceiverMessageScheme<T>, string> {
        const outputSchemas = route.schema.output;
        const matchingSchema = Object.values(outputSchemas).find(schema => schema.code === this.code);
        if (!matchingSchema) {
            return Result.Err("No matching output schema for code " + this.code);
        }

        const payloadResult = zodParse(matchingSchema.payload, this.payload);
        if (payloadResult.isErr())
            return Result.Err(payloadResult.unwrapErr());

        return Result.Ok(new HubToServiceReceiverMessageScheme<T>(this.code, payloadResult.unwrap() as z.infer<T["schema"]["output"][string]["payload"]>));
    }

    toString(): string {
        return [HubToServiceMessageType.Receiver.toString(), this.sourceContainer, this.funcId, this.code.toString(), this.payload].join(SEPARATOR);
    }
}

enum ServiceToHubMessageType {
    MessageToClient = 0,
    BroadcastToContainer = 1,
};

export abstract class ServiceToHubMessage {
    protected type: ServiceToHubMessageType;
    protected payload: string;

    protected constructor(type: ServiceToHubMessageType, payload: string) {
        this.type = type;
        this.payload = payload;
    }

    static fromRawString(sourceContainer: string, rawString: string): Result<ServiceToHubMessage, string> {
        const parts = splitHeaderData(rawString);
        if (parts.length < 2)
            return Result.Err("Invalid message format");

        const typeString = parts[0];
        const typeNum = parseInt(typeString!, 10);
        if (isNaN(typeNum))
            return Result.Err("Invalid message type");

        switch (typeNum) {
            case ServiceToHubMessageType.MessageToClient:
                if (parts.length < 5) return Result.Err("Invalid MessageToClient format");
                const [, funcId, recipientUserIds, code, ...payloadParts] = parts;
                const payload = payloadParts.join(SEPARATOR);
                return Result.Ok(new ServiceToHubClientMessage(sourceContainer, funcId!, recipientUserIds!, parseInt(code!, 10), payload));

            case ServiceToHubMessageType.BroadcastToContainer:
                if (parts.length < 5) return Result.Err("Invalid BroadcastToContainer format");
                const [, bTargetContainer, bFuncId, bRecipientUserIds, ...bPayloadParts] = parts;
                const bPayload = bPayloadParts.join(SEPARATOR);
                return Result.Ok(new ServiceToHubBroadcastMessage(bTargetContainer!, bFuncId!, bRecipientUserIds!, bPayload!));

            default:
                return Result.Err("Unknown message type");
        }
    }

    getType(): ServiceToHubMessageType {
        return this.type;
    }

    getPayloadAsObject<T extends z.ZodTypeAny>(schema: T): Result<z.infer<T>, string> {
        return zodParse(schema, this.payload);
    }

    abstract toString(): string;
}

export class ServiceToHubClientMessage extends ServiceToHubMessage {
    private rawRecipientUserIds: string;
    private sourceContainer: string;
    private funcId: string;
    private code: number;

    constructor(sourceContainer: string, funcId: string, recipientUserIds: string, code: number, payload: string) {
        super(ServiceToHubMessageType.MessageToClient, payload);
        this.sourceContainer = sourceContainer;
        this.funcId = funcId;
        this.rawRecipientUserIds = recipientUserIds;
        this.code = code;
    }

    getSourceContainer(): string {
        return this.sourceContainer;
    }

    getFuncId(): string {
        return this.funcId;
    }

    getRecipientUserIds(): number[] {
        return this.rawRecipientUserIds
            .split(",")
            .map(idStr => parseInt(idStr, 10))
            .filter(idNum => !isNaN(idNum));
    }

    convertHubToClientMessage(): HubToClientMessage {
        return new HubToClientMessage(this.sourceContainer, this.funcId, this.code, this.payload);
    }

    toString(): string {
        return [this.type.toString(), this.funcId, this.rawRecipientUserIds, this.code.toString(), this.payload].join(SEPARATOR);
    }
}

export class ServiceToHubBroadcastMessage extends ServiceToHubMessage {
    private rawRecipientUserIds: string;
    private targetContainer: string;
    private funcId: string;

    constructor(targetContainer: string, funcId: string, recipientUserIds: string, payload: string) {
        super(ServiceToHubMessageType.BroadcastToContainer, payload);
        this.targetContainer = targetContainer;
        this.funcId = funcId;
        this.rawRecipientUserIds = recipientUserIds;
    }

    getTargetContainer(): string {
        return this.targetContainer;
    }

    getFuncId(): string {
        return this.funcId;
    }

    getRecipientUserIds(): number[] {
        return this.rawRecipientUserIds
            .split(",")
            .map(idStr => parseInt(idStr, 10))
            .filter(idNum => !isNaN(idNum));
    }

    getPayloadAsString(): string {
        return this.payload;
    }

    toServiceMessage(userId: string | number): HubToServiceHandlerMessage {
        return new HubToServiceHandlerMessage(this.funcId, userId.toString(), this.payload);
    }

    toString(): string {
        return [this.type.toString(), this.targetContainer, this.funcId, this.rawRecipientUserIds, this.payload].join(SEPARATOR);
    }
}

export type HubToClientMessageScheme<T extends WebSocketRouteDef> = {
    [K in keyof T["schema"]["output"]]: {
        sourceContainer: string;
        funcId: string;
        code: T["schema"]["output"][K]["code"];
        payload: z.infer<T["schema"]["output"][K]["payload"]>;
    };
}[keyof T["schema"]["output"]];

export class HubToClientMessage {
    private sourceContainer: string;
    private funcId: string;
    private code: number;
    private payload: string;

    constructor(sourceContainer: string, funcId: string, code: number, payload: string) {
        this.sourceContainer = sourceContainer;
        this.funcId = funcId;
        this.code = code;
        this.payload = payload;
    }

    static fromRawString(rawString: string): Result<HubToClientMessage, string> {
        const parts = splitHeaderData(rawString);
        if (parts.length < 4)
            return Result.Err("Invalid message format");

        const [sourceContainer, funcId, code, ...json] = parts;
        const payload = json.join(SEPARATOR);
        return Result.Ok(new HubToClientMessage(sourceContainer!, funcId!, parseInt(code!, 10), payload));
    }

    getFuncId(): string {
        return this.funcId;
    }

    getCode(): number {
        return this.code;
    }

    toString(): string {
        return [this.sourceContainer, this.funcId, this.code.toString(), this.payload].join(SEPARATOR);
    }

    asValidated<T extends WebSocketRouteDef>(route: T): Result<HubToClientMessageScheme<T>, string> {
        const outputSchemas = route.schema.output;
        const matchingSchema = Object.values(outputSchemas).find(schema => schema.code === this.code);
        if (!matchingSchema) {
            return Result.Err("No matching output schema for code " + this.code);
        }

        const payloadResult = zodParse(matchingSchema.payload, this.payload);
        if (payloadResult.isErr())
            return Result.Err(payloadResult.unwrapErr());

        return Result.Ok({
            sourceContainer: this.sourceContainer,
            funcId: this.funcId,
            code: this.code,
            payload: payloadResult.unwrap() as z.infer<T["schema"]["output"][string]["payload"]>
        });
    }
}

