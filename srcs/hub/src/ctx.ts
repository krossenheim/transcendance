import { ClientToHubMessage, HubToServiceMessage, ServiceToHubMessage, ServiceToHubClientMessage, ServiceToHubBroadcastMessage, HubToClientMessage, HubToServiceReceiverMessage } from "@app/shared/socket_messages";
import { int_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { isWSAuthenticated } from "./auth.js";
import WebSocket from "ws";

import type { TypePayloadHubToUsersSchema } from "@app/shared/api/service/hub/hub_interfaces";

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
      const message = new HubToServiceReceiverMessage(
        "hub",
        connected ? int_url.ws.hub.userConnected.funcId : int_url.ws.hub.userDisconnected.funcId,
        0,
        `{"userId":${user_id}}`
      )
      if (socket.readyState > 1)
        console.error("Socket to container not open, cannot send.");
      else {
        socket.send(message.toString());
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

  private _sendMessageToUsers(ctx: HubCTX, message: ServiceToHubClientMessage): Result<null, string> {
    for (const userId of message.getRecipientUserIds()) {
      const userSocket = ctx.getUserSocketById(userId);
      if (userSocket)
        userSocket.sendMessage(message.convertHubToClientMessage());
    }
    return Result.Ok(null);
  }

  private _handleInternalMessage(ctx: HubCTX, message: ServiceToHubBroadcastMessage): Result<null, string> {
    const internalContainer = ctx.getInternalContainerSocketByName(message.getTargetContainer());
    if (!internalContainer) return Result.Err("Internal container not found");

    for (const userId of message.getRecipientUserIds())
      internalContainer.sendMessage(message.toServiceMessage(userId));

    return Result.Ok(null);
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

  public async sendMessage(message: HubToServiceMessage): Promise<void> {
    if (this.isSocketOpen()) {
      this.ws!.send(message.toString());
    } else {
      this.messageStack.push(message.toString());
    }
  }

  public async handleMessage(ctx: HubCTX, message: string): Promise<Result<null, string>> {
    const parsedData = ServiceToHubMessage.fromRawString(this.containerName, message);
    if (parsedData.isErr()) {
      console.error("Invalid payload to users schema: " + parsedData.unwrapErr());
      return Result.Err("Invalid payload to users schema");
    }

    const data = parsedData.unwrap();
    if (data instanceof ServiceToHubBroadcastMessage)
      return this._handleInternalMessage(ctx, data);

    else if (data instanceof ServiceToHubClientMessage)
      return this._sendMessageToUsers(ctx, data);

    return Result.Err("Unhandled internal container message type");
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
    const validateIncoming = ClientToHubMessage.fromRawString(message);
    if (validateIncoming.isErr()) {
      console.error("Invalid client to hub message: " + validateIncoming.unwrapErr());
      return Result.Err("Input data validation failed");
    }

    const userMessage = validateIncoming.unwrap();
    const containerSocket = ctx.getInternalContainerSocketByName(userMessage.getTargetContainer());
    containerSocket.sendMessage(userMessage.convertHubToServiceMessage(this.id!));
    return Result.Ok(null);
  }

  public isAuthenticated(): boolean {
    return this.id !== null;
  }

  public getSocket(): WebSocket {
    return this.ws;
  }

  public sendMessage<T extends TypePayloadHubToUsersSchema>(message: HubToClientMessage): void {
    this.ws.send(message.toString());
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