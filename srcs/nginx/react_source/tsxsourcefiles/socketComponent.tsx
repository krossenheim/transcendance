import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  ReactNode,
  useContext,
} from "react";
import { AuthResponseType } from "../../../nodejs_base_image/utils/api/service/auth/loginResponse";
import { PayloadHubToUsersSchema } from "../../../nodejs_base_image/utils/api/service/hub/hub_interfaces";
import type { TypePayloadHubToUsersSchema } from "../../../nodejs_base_image/utils/api/service/hub/hub_interfaces";

interface SocketComponentProps {
  children: ReactNode;
  AuthResponseObject: AuthResponseType;
}

interface WebSocketContextValue {
  socket: React.MutableRefObject<WebSocket | null>; // renamed from ws
  payloadReceived: TypePayloadHubToUsersSchema | null;
  authResponse: AuthResponseType;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export default function SocketComponent({
  children,
  AuthResponseObject,
}: SocketComponentProps) {
  const socket = useRef<WebSocket | null>(null);
  const [payloadReceived, setPayloadReceived] =
    useState<TypePayloadHubToUsersSchema | null>(null);
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = protocol + "//" + window.location.host + "/ws";

  useEffect(() => {
    if (!socket.current) {
      socket.current = new WebSocket(wsUrl);

      socket.current.onopen = () => {
        console.log("WebSocket connected, authorizing:");
        socket.current!.send(
          JSON.stringify({ authorization: AuthResponseObject.tokens.jwt })
        );
      };

      socket.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const parsed = PayloadHubToUsersSchema.safeParse(data);
          if (!parsed.success) {
            console.log("Unrecognized message:", event.data);
            return;
          }
          setPayloadReceived(parsed.data);
        } catch {
          console.log("Couldn't parse:", event.data);
        }
      };

      socket.current.onclose = () => console.log("WebSocket disconnected");
      socket.current.onerror = (err) => console.error("WebSocket error:", err);
    }
  }, [wsUrl, AuthResponseObject.tokens.jwt]);

  return (
    <WebSocketContext.Provider
      value={
        {
          socket,
          payloadReceived,
          authResponse: AuthResponseObject,
        } as WebSocketContextValue
      }
    >
      {children}
      <input
        type="text"
        placeholder="debug ws send string"
        onKeyDown={(e) => {
          if (e.key === "Enter" && socket.current) {
            socket.current.send((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = "";
          }
        }}
        style={{
          backgroundColor: "black",
          color: "yellow",
          border: "1px solid yellow",
          padding: "5px 10px",
          marginTop: "10px",
          width: "100%",
          boxSizing: "border-box",
        }}
      />
    </WebSocketContext.Provider>
  );
}

// Hook to consume the context
export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context)
    throw new Error("useWebSocket must be used inside <SocketComponent>");
  return context;
}
