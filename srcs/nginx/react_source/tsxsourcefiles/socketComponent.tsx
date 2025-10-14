import React, { useState, useEffect } from "react";
import { AuthResponseType } from "../../../nodejs_base_image/utils/api/service/auth/loginResponse";
import { PayloadHubToUsersSchema } from "../../../nodejs_base_image/utils/api/service/hub/hub_interfaces";
import PongComponent from "./pongComponent";
import ChatComponent from "./chatComponent";

interface SocketComponentProps {
  AuthResponseObject: AuthResponseType;
}

export default function SocketComponent({
  AuthResponseObject,
}: SocketComponentProps) {
  // This is one session/websocket to the server
  const [username, setUsername] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = protocol + "//" + window.location.host + "/ws";

  useEffect(
    () => {
      const ws = new WebSocket(wsUrl);
      if (!AuthResponseObject) {
        console.error("Tryign to render without authresponseobject ");
        return;
      }

      ws.onopen = () => {
        setConnected(true);
        console.log("WebSocket connected, authorizing: ");
        const jsonout = { authorization: AuthResponseObject.tokens.jwt };
        ws.send(JSON.stringify(jsonout));
      };

      ws.onmessage = (event) => {
        // Boilerplate handler
        // For task in task
        //   task.handler(event.data);
        try {
          const data = JSON.parse(event.data);
          const valid_message = PayloadHubToUsersSchema.safeParse(data);
          if (!valid_message.success) {
            console.log("Unrecognized message format:", event.data);
            return;
          }
        } catch {
          console.log("Couldn't parse:", event.data);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        console.log("WebSocket disconnected");
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
      };

      setSocket(ws);

      // Cleanup when unmounting
      return () => ws.close();
    },
    // Will trigger when these change
    [username]
    // '[]' is on init and on destruction
    // '' omits
  );

  return (
    <>
      <ChatComponent webSocket={socket} />
      <PongComponent webSocket={socket} />
    </>
  );
}
