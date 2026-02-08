"use client"
import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react"
import { ClientToHubMessage, HubToClientMessage } from "@app/shared/socket_messages"
import type { WebSocketRouteDef } from "@app/shared/api/service/common/endpoints"
import type { AuthResponseType } from "@app/shared/api/service/auth/loginResponse"
import { z } from "zod"

import { HubToClientMessageScheme } from "@app/shared/socket_messages"

type SocketCallback<T extends WebSocketRouteDef> = (message: HubToClientMessageScheme<T>, schema: T["schema"]) => HandlerResult;
type SocketMessageSubscriber = <T extends WebSocketRouteDef>(route: T, callback: SocketCallback<T>) => () => void;

export type SocketMessageSender = <T extends WebSocketRouteDef>(route: T, payload: z.infer<T["schema"]["args"]>) => void;

export enum HandlerResult {
  Handled,
  NotHandled
}

interface SocketContextType {
  isConnected: boolean;
  sendMessage: SocketMessageSender;
  subscribe: SocketMessageSubscriber;
}

interface SocketCallbackSubscribtion<T extends WebSocketRouteDef> {
  route: T;
  callback: SocketCallback<T>;
}

const SocketContext = createContext<SocketContextType | null>(null);

let globalSocket: WebSocket | null = null
export const closeGlobalSocket = () => {
  if (globalSocket) {
    try {
      console.log('Closing global websocket connection');
      globalSocket.close(1000);
      globalSocket = null;
    } catch (e) {
      console.warn('Error while closing global socket:', e);
    }
  }
}

export function useWebSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error("useWebSocket must be used inside <SocketComponent>");
  return context;
}

export default function SocketComponent({
  AuthResponseObject,
  children,
}: {
  AuthResponseObject: AuthResponseType | null
  children: React.ReactNode
}) {
  const socket = useRef<WebSocket | null>(null)
  const messageQueue = useRef<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  
  const subscribers = useRef<Map<string, Set<SocketCallbackSubscribtion<any>>>>(new Map())

  const subscribe = useCallback(<T extends WebSocketRouteDef>(route: T, callback: SocketCallback<T>) => {
    const funcId = route.funcId;

    if (!subscribers.current.has(funcId)) {
      subscribers.current.set(funcId, new Set())
    }

    const subscription: SocketCallbackSubscribtion<T> = { route, callback };
    subscribers.current.get(funcId)?.add(subscription);

    return () => {
      const callbacks = subscribers.current.get(funcId)
      if (callbacks) {
        callbacks.delete(subscription);
        if (callbacks.size === 0) {
          subscribers.current.delete(funcId)
        }
      }
    }
  }, [])

  const sendMessage = useCallback(<T extends WebSocketRouteDef>(route: T, payload: z.infer<T["schema"]["args"]>) => {
    const messagePayload = new ClientToHubMessage(route.container, route.funcId, JSON.stringify(payload)).toString();
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(messagePayload);
    } else {
      messageQueue.current.push(messagePayload);
    }
  }, [])

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      // Debug logging disabled for performance
      // console.log('[Socket] Message received:', event.data, typeof event.data);
      const messageParseResult = HubToClientMessage.fromRawString(event.data);

      if (messageParseResult.isErr()) {
        console.error('[Socket] Failed to parse message:', messageParseResult.unwrapErr());
        return;
      }
      
      const message = messageParseResult.unwrap();
      const callbacks = subscribers.current.get(message.getFuncId());

      let fatalError = false;
      let parsedMessage: any = null;

      const currentCallbacks = callbacks ? Array.from(callbacks) : [];

      for (const sub of currentCallbacks) {
        const { route, callback } = sub;
        if (parsedMessage === null) {
          const parsedPayloadResult = message.asValidated(route);
          if (parsedPayloadResult.isErr()) {
            console.error('[Socket] Payload validation failed for funcId', message.getFuncId(), ':', parsedPayloadResult.unwrapErr());
            return;
          }
          parsedMessage = parsedPayloadResult.unwrap();
        }

        let handlerResult = HandlerResult.NotHandled;
        try {
          handlerResult = callback(parsedMessage, route.schema);
        } catch (e) {
          console.error('[Socket] Error in callback for funcId', message.getFuncId(), ':', e);
        }

        if (handlerResult === HandlerResult.NotHandled) {
          fatalError = true;
        }
      }

      if (fatalError) {
        console.error('[Socket] No handlers processed the message for funcId', message.getFuncId());
      }

      if (currentCallbacks.length === 0) {
        console.warn('[Socket] No subscribers for message funcId', message.getFuncId());
      }
    } catch (e) {
      console.error('[Socket] Failed to parse message', e)
    }
  }, [])

  const connect = useCallback(() => {
    if (!AuthResponseObject || socket.current) return

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const wsUrl = protocol + "//" + window.location.host + "/ws"

    const ws = new WebSocket(wsUrl)
    socket.current = ws
    globalSocket = ws

    ws.onopen = () => {
      console.log('[Socket] Connected')
      setIsConnected(true)
      ws.send(JSON.stringify({
        authorization: AuthResponseObject!.tokens.jwt,
      }))
      // Flush message queue
      while (messageQueue.current.length > 0) {
        const msg = messageQueue.current.shift()!
        ws.send(msg)
      }
    }

    ws.onmessage = handleMessage

    ws.onclose = () => {
      console.log('[Socket] Disconnected')
      setIsConnected(false)
      socket.current = null
    }

    ws.onerror = (err) => {
      console.error('[Socket] Error', err)
      ws.close()
    }
  }, [AuthResponseObject, handleMessage])

  useEffect(() => {
    connect()
    return () => closeGlobalSocket()
  }, [connect])

  return (
    <SocketContext.Provider value={{ isConnected, sendMessage, subscribe }}>
      {children}
    </SocketContext.Provider>
  )
}