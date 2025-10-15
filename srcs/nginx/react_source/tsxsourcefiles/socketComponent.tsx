import React, {
  useState,
  useEffect,
  createContext,
  ReactNode,
  useContext,
} from "react";
import { AuthResponseType } from "../../../nodejs_base_image/utils/api/service/auth/loginResponse";
import { PayloadHubToUsersSchema } from "../../../nodejs_base_image/utils/api/service/hub/hub_interfaces";
import type { TypePayloadHubToUsersSchema } from "../../../nodejs_base_image/utils/api/service/hub/hub_interfaces";
// import PongComponent from "./pongComponent";
// import ChatComponent from "./chatComponent";

interface SocketComponentProps {
  children: ReactNode; // <Other HostComponent={name outside}
  AuthResponseObject: AuthResponseType;
}
interface WebSocketContextValue {
  socket: WebSocket | null;
  payloadReceived: TypePayloadHubToUsersSchema | null;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export default function SocketComponent({
  children,
  AuthResponseObject,
}: SocketComponentProps) {
  // This is one session/websocket to the server
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [payloadReceived, setPayloadReceived] =
    useState<TypePayloadHubToUsersSchema | null>(null);
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = protocol + "//" + window.location.host + "/ws";

  useEffect(
    () => {
      const ws = new WebSocket(wsUrl);
      setSocket(ws);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const valid_message = PayloadHubToUsersSchema.safeParse(data);
          if (!valid_message.success) {
            console.log("Unrecognized message format:", event.data);
            return;
          }
          setPayloadReceived(valid_message.data);
        } catch {
          console.log("Couldn't parse:", event.data);
        }
      };

      ws.onopen = () => {
        console.log("WebSocket connected, authorizing: ");
        const jsonout = { authorization: AuthResponseObject.tokens.jwt };
        ws.send(JSON.stringify(jsonout));
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
      };

      // Cleanup when unmounting
      return () => ws.close();
    },
    // Will trigger when these change
    []
    // '[]' is on init and on destruction
    // '' omits
  );

  return (
    <WebSocketContext.Provider value={{ socket, payloadReceived }}>
      {children}
    </WebSocketContext.Provider>
  );
  // return (
  //   <>
  //     <ChatComponent webSocket={socket} />
  //     <PongComponent webSocket={socket} />
  //   </>
  // );
}

// One socket
export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context)
    throw new Error("useWebSocket must be used inside <WebSocketProvider>");
  return context;
}
