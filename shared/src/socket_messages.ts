import { extend } from "zod/v4/core/util.cjs";
import { Result } from "./api/service/common/result";
import { zodParse } from "./api/service/common/zodUtils";
import { WebSocketRouteDef, user_url } from "@app/shared/api/service/common/endpoints";
import { InferWSHandlerBody, WSHandlerReturnValue } from "./websocketResponse";
import z from "zod";

const SEPARATOR = "%";

function splitHeaderData(raw_string: string): string[] {
    return raw_string.split(SEPARATOR);
}

// targetContainer%funcId%payload
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
        return Result.Ok(new ClientToHubMessage(targetContainer, funcId, payload));
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

    convertHubToServiceMessage(userId: string | number): HubToServiceMessage {
        return new HubToServiceMessage(this.funcId, userId.toString(), this.payload);
    }
}

class HubToServiceMessageScheme<T extends WebSocketRouteDef> {
    public readonly userId: number;
    public readonly payload: InferWSHandlerBody<T>;

    constructor(userId: number, payload: InferWSHandlerBody<T>) {
        this.userId = userId;
        this.payload = payload;
    }
}

// funcId%userId%payload
export class HubToServiceMessage {
    private funcId: string;
    private userId: string;
    private payload: string;

    private cachedPayloadObject: [any | null, z.ZodTypeAny | null] = [null, null];

    constructor(funcId: string, userId: string, payload: string) {
        this.funcId = funcId;
        this.userId = userId;
        this.payload = payload;
    }

    static fromRawString(raw_string: string): Result<HubToServiceMessage, string> {
        const parts = splitHeaderData(raw_string);
        if (parts.length < 3)
            return Result.Err("Invalid message format");

        const [funcId, userId, ...json] = parts;
        const payload = json.join(SEPARATOR);
        return Result.Ok(new HubToServiceMessage(funcId, userId, payload));
    }

    getFuncId(): string {
        return this.funcId;
    }

    getUserId(): string {
        return this.userId;
    }

    getPayloadAsString(): string {
        return this.payload;
    }

    asValidated<T extends WebSocketRouteDef>(route: T): Result<HubToServiceMessageScheme<T>, string> {
        const payloadResult = zodParse(route.schema.args, this.payload);
        if (payloadResult.isErr())
            return Result.Err(payloadResult.unwrapErr());

        return Result.Ok(new HubToServiceMessageScheme<T>(route, parseInt(this.userId, 10), this.payload as InferWSHandlerBody<T>));
    }

    toString(): string {
        return [this.funcId, this.userId, this.payload].join(SEPARATOR);
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
        const typeNum = parseInt(typeString, 10);
        if (isNaN(typeNum))
            return Result.Err("Invalid message type");

        switch (typeNum) {
            case ServiceToHubMessageType.MessageToClient:
                if (parts.length < 4) return Result.Err("Invalid MessageToClient format");
                const [, funcId, recipientUserIds, ...payloadParts] = parts;
                const payload = payloadParts.join(SEPARATOR);
                return Result.Ok(new ServiceToHubClientMessage(sourceContainer, funcId, recipientUserIds, payload));

            case ServiceToHubMessageType.BroadcastToContainer:
                if (parts.length < 4) return Result.Err("Invalid BroadcastToContainer format");
                const [, bTargetContainer, bFuncId, bRecipientUserIds, ...bPayloadParts] = parts;
                const bPayload = bPayloadParts.join(SEPARATOR);
                return Result.Ok(new ServiceToHubBroadcastMessage(bTargetContainer, bFuncId, bRecipientUserIds, bPayload));

            default:
                return Result.Err("Unknown message type");
        }
    }

    getType(): ServiceToHubMessageType {
        return this.type;
    }

    getPayloadAsString(): string {
        return this.payload;
    }

    getPayloadAsObject<T extends z.ZodTypeAny>(schema: T): Result<z.infer<T>, string> {
        return zodParse(schema, this.payload);
    }
}

// messageType%funcId%recipient1,recipient2%payload
export class ServiceToHubClientMessage extends ServiceToHubMessage {
    private rawRecipientUserIds: string;
    private sourceContainer: string;
    private funcId: string;

    constructor(sourceContainer: string, funcId: string, recipientUserIds: string, payload: string) {
        super(ServiceToHubMessageType.MessageToClient, payload);
        this.sourceContainer = sourceContainer;
        this.funcId = funcId;
        this.rawRecipientUserIds = recipientUserIds;
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

    getPayloadAsString(): string {
        return this.payload;
    }

    convertHubToClientMessage(): HubToClientMessage {
        return new HubToClientMessage(this.sourceContainer, this.funcId, this.payload);
    }
}

// messageType%targetContainer%funcId%recipient1,recipient2%payload
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

    toServiceMessage(userId: string | number): HubToServiceMessage {
        return new HubToServiceMessage(this.funcId, userId.toString(), this.payload);
    }
}

export class HubToClientMessage {
    private sourceContainer: string;
    private funcId: string;
    private payload: string;

    constructor(sourceContainer: string, funcId: string, payload: string) {
        this.sourceContainer = sourceContainer;
        this.funcId = funcId;
        this.payload = payload;
    }

    static fromRawString(sourceContainer: string, rawString: string): Result<HubToClientMessage, string> {
        const parts = splitHeaderData(rawString);
        if (parts.length < 2)
            return Result.Err("Invalid message format");

        const [funcId, ...json] = parts;
        const payload = json.join(SEPARATOR);
        return Result.Ok(new HubToClientMessage(sourceContainer, funcId, payload));
    }

    getFuncId(): string {
        return this.funcId;
    }

    getPayloadAsString(): string {
        return this.payload;
    }

    getPayloadAsObject<T extends z.ZodTypeAny>(schema: T): Result<z.infer<T>, string> {
        return zodParse(schema, this.payload);
    }

    toString(): string {
        return [this.sourceContainer, this.funcId, this.payload].join(SEPARATOR);
    }
}
