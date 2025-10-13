function RootMain({ AuthResponseObject }) {
  // This is one session/websocket to the server
  const [username, setUsername] = React.useState("");
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [socket, setSocket] = React.useState(null);
  const [connected, setConnected] = React.useState(false);
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = protocol + "//" + window.location.host + "/ws";

  React.useEffect(
    () => {
      const ws = new WebSocket(wsUrl);
      if (!AuthResponseObject) {
        console.error("Tryign to render without authresponseobject ");
        return;
      }

      ws.onopen = () => {
        setConnected(true);
        console.log("WebSocket connected");
        // Send token as first message.
        const jsonout = { authorization: AuthResponseObject.tokens.jwt };
        ws.send(JSON.stringify(jsonout));
      };

      ws.onmessage = (event) => {
        // Boilerplate handler
        // For task in task
        //   task.handler(event.data);
        try {
          const data = JSON.parse(event.data);
          setMessages((prev) => [...prev, data]);
        } catch {
          setMessages((prev) => [...prev, { type: "raw", text: event.data }]);
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

  return <ChatComponent webSocket={socket} />;
}

window.RootMain = RootMain;
