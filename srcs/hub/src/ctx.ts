import { PayloadToUsersSchema, UserToHubSchema, InvokeWSFunctionSchema } from "@app/shared/api/service/hub/hub_interfaces";
import { int_url } from "@app/shared/api/service/common/endpoints";
import { JSONtoZod } from "@app/shared/api/service/common/json";
import { Result } from "@app/shared/api/service/common/result";
import { isWSAuthenticated } from "./auth.js";
import WebSocket from "ws";

import type { TypePayloadHubToUsersSchema, T_ForwardToContainer } from "@app/shared/api/service/hub/hub_interfaces";
import type { GetUserType } from "@app/shared/api/service/db/user";

export class HubCTX {
  private userSockets: Map<number, UserSocket>;
  private socketUsers: Map<WebSocket, UserSocket>;

  private internalContainerSocketByName: Map<string, InternalSocket>;
  private internalContainerSocketBySocket: Map<WebSocket, InternalSocket>;

  constructor() {
    this.userSockets = new Map();
    this.socketUsers = new Map();

    this.internalContainerSocketByName = new Map();
    this.internalContainerSocketBySocket = new Map();
  }

  private _notifyContainersOfConnectionStateChange(user_id: number, connected: boolean) {
    for (const [socket, socket_obj] of this.internalContainerSocketBySocket.entries()) {
      const payload: GetUserType = { userId: user_id };
      const wrapper: TypePayloadHubToUsersSchema = {
        source_container: "hub",
        funcId: connected ? int_url.ws.hub.userConnected.funcId : int_url.ws.hub.userDisconnected.funcId,
        code: 0,
        payload: payload,
      };
      if (socket.readyState > 1)
        console.error("Socket to container not open, cannot send.");
      else {
        socket.send(JSON.stringify(wrapper));
        console.log(`Informed container ${socket_obj.getContainerName()} of user ${connected ? 'connection' : 'dis-connection'}: ${user_id}`);
      }
    }
  }

  public disconnectUserSocket(socket: WebSocket) {
    console.log("Disconnecting user socket.");
    const userSocket = this.socketUsers.get(socket);
    if (userSocket === undefined) return;

    const wasAuthenticated: boolean = userSocket.isAuthenticated();
    if (wasAuthenticated) {
      this.userSockets.delete(userSocket.id!);
      this._notifyContainersOfConnectionStateChange(userSocket.id!, false);
    }

    this.socketUsers.delete(socket);
  }

  public saveUserSocket(socket: UserSocket) {
    this.socketUsers.set(socket.getSocket(), socket);

    if (socket.isAuthenticated()) {
      this.userSockets.set(socket.id!, socket);
      this._notifyContainersOfConnectionStateChange(socket.id!, true);
    }
  }

  public getUserSocketBySocket(socket: WebSocket): UserSocket {
    const currentSocket = this.socketUsers.get(socket);
    if (currentSocket === undefined) {
      this.saveUserSocket(new UserSocket(socket));
      return this.socketUsers.get(socket)!;
    }
    return currentSocket;
  }

  public getUserSocketById(user_id: number): UserSocket | undefined {
    return this.userSockets.get(user_id);
  }

  public saveInternalContainerSocket(container_name: string, socket: WebSocket) {
    let internalSocket = this.internalContainerSocketByName.get(container_name);
    if (internalSocket === undefined) {
      internalSocket = new InternalSocket(container_name);
      this.internalContainerSocketByName.set(container_name, internalSocket);
    }

    this.internalContainerSocketBySocket.set(socket, internalSocket);
    internalSocket.setSocket(socket);
  }

  public getInternalContainerSocketByName(container_name: string): InternalSocket {
    let internalSocket = this.internalContainerSocketByName.get(container_name);
    if (internalSocket === undefined) {
      internalSocket = new InternalSocket(container_name);
      this.internalContainerSocketByName.set(container_name, internalSocket);
    }
    return internalSocket;
  }

  public getInternalContainerSocketByWebSocket(socket: WebSocket): InternalSocket | undefined {
    return this.internalContainerSocketBySocket.get(socket);
  }
}

export class InternalSocket {
  private ws: WebSocket | null;
  private containerName: string;
  private messageStack: Array<string>;

  constructor(containerName: string) {
    this.ws = null;
    this.containerName = containerName;
    this.messageStack = [];
  }

  private _sendMessageToUsers<T extends TypePayloadHubToUsersSchema>(ctx: HubCTX, recipients: Array<number>, message: T) {
    for (const userId of recipients) {
      const userSocket = ctx.getUserSocketById(userId);
      if (userSocket)
        userSocket.sendMessage(message);
    }
  }

  private _handlePotentialInternalMessage(ctx: HubCTX, message: string): boolean {
    const validateIncoming = JSONtoZod(message, InvokeWSFunctionSchema);
    if (validateIncoming.isErr()) return false;

    const internalMessage = validateIncoming.unwrap();
    const internalContainer = ctx.getInternalContainerSocketByName(internalMessage.target_container);
    if (!internalContainer) return false;

    for (const userId of internalMessage.userIds) {
      internalContainer.sendMessage({
        user_id: userId,
        funcId: internalMessage.funcId,
        payload: internalMessage.payload,
      });
    }
    return true;
  }

  public getSocket(): Result<WebSocket, null> {
    if (this.ws === null)
      return Result.Err(null);
    return Result.Ok(this.ws);
  }

  public isSocketOpen(): boolean {
    return this.ws !== null && this.ws.readyState === this.ws.OPEN;
  }

  public setSocket(ws: WebSocket): void {
    if (ws === this.ws)
      return;
    this.ws = ws;

    if (this.messageStack.length > 0) {
      for (const msg of this.messageStack) {
        this.ws.send(msg);
      }
      this.messageStack = [];
    }
  }

  public getContainerName(): string {
    return this.containerName;
  }

  public async sendMessage<T extends T_ForwardToContainer>(message: T): Promise<void> {
    const messageString = JSON.stringify(message);
    if (this.isSocketOpen()) {
      this.ws!.send(messageString);
    } else {
      this.messageStack.push(messageString);
    }
  }

  public async handleMessage(ctx: HubCTX, message: string): Promise<Result<null, string>> {
    const parsedData = JSONtoZod(message, PayloadToUsersSchema);
    if (parsedData.isErr()) {
      if (this._handlePotentialInternalMessage(ctx, message))
        return Result.Ok(null);

      console.error("Invalid payload to users schema: " + parsedData.unwrapErr());
      return Result.Err("Invalid payload to users schema");
    }

    const data = parsedData.unwrap();
    this._sendMessageToUsers(
      ctx,
      data.recipients,
      {
        source_container: this.containerName,
        funcId: data.funcId,
        code: data.code,
        payload: data.payload,
      }
    );
    return Result.Ok(null);
  }
}

export class UserSocket {
  private ws: WebSocket;
  private messageStack: Array<string>;
  private isAuthenticating: boolean;

  public id: number | null;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.messageStack = [];
    this.id = null;
    this.isAuthenticating = false;
  }

  private async _handleStackedMessages(ctx: HubCTX): Promise<void> {
    const stacked = this.messageStack.slice();
    this.messageStack = [];

    const handlers = stacked.map(async (message) => {
      try {
        const result = await this.handleMessage(ctx, message);
        if (result.isErr()) {
          const errMsg = result.unwrapErr();
          console.error("Error handling stacked message: " + errMsg);
          this.sendHubError(errMsg, message);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("Unhandled exception while handling stacked message:", err);
        this.sendHubError(errMsg, message);
      }
    });

    await Promise.all(handlers);
  }

  private async _handleAuthenticationMessage(ctx: HubCTX, message: string): Promise<Result<null, string>> {
    if (this.isAuthenticating) {
      return Result.Err("Already authenticating");
    }
    this.isAuthenticating = true;

    const authResult = await isWSAuthenticated(message);
    if (authResult.isErr()) {
      ctx.disconnectUserSocket(this.ws);
      return Result.Err("Authentication failed: " + authResult.unwrapErr());
    }

    this.id = authResult.unwrap();
    this.isAuthenticating = false;
    ctx.saveUserSocket(this);

    await this._handleStackedMessages(ctx);
    return Result.Ok(null);
  }

  private async _handleClientMessage(ctx: HubCTX, message: string): Promise<Result<null, string>> {
    const validateIncoming = JSONtoZod(message, UserToHubSchema);
    if (validateIncoming.isErr()) {
      console.error("Invalid user to hub schema: " + validateIncoming.unwrapErr());
      return Result.Err("Input data validation failed");
    }

    const userMessage = validateIncoming.unwrap();
    const containerSocket = ctx.getInternalContainerSocketByName(userMessage.target_container);
    containerSocket.sendMessage({
      user_id: this.id!,
      funcId: userMessage.funcId,
      payload: userMessage.payload,
    });
    return Result.Ok(null);
  }

  public isAuthenticated(): boolean {
    return this.id !== null;
  }

  public getSocket(): WebSocket {
    return this.ws;
  }

  public sendMessage<T extends TypePayloadHubToUsersSchema>(message: T): void {
    this.ws.send(JSON.stringify(message));
  }

  public sendHubError(message: string, original: any): void {
    const data = { generic_error: { message: message, original: original } };
    this.ws.send(JSON.stringify(data));
  }

  public async handleMessage(ctx: HubCTX, message: string): Promise<Result<null, string>> {
    if (this.isAuthenticating) {
      this.messageStack.push(message);
      return Result.Ok(null);
    }

    if (!this.isAuthenticated()) {
      return await this._handleAuthenticationMessage(ctx, message);
    } else {
      return await this._handleClientMessage(ctx, message);
    }
  }
}