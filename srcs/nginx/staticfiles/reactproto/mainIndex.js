function MainIndex({ AuthResponseObject }) {
  // aka everything
  // This will receive output from LoginForm or RegisterForm, in the way of a value returned from an HTTP request.
  const [username, setUsername] = React.useState("");
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [socket, setSocket] = React.useState(null);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(
    () => {
      if (!AuthResponseObject) {
        console.error("Tryign to render without authresponseobject ");
        return;
      }
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = protocol + "//" + window.location.host + "/ws";
      const ws = new WebSocket(wsUrl);

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

  /** Send a message through the WebSocket */
  function sendMessage(e) {
    e.preventDefault();
    if (socket && connected && input.trim()) {
      socket.send(JSON.stringify({ type: "message", text: input, username }));
      setInput("");
    }
  }

  return (
    <div className="flex flex-col w-full max-w-lg mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">
        Welcome {username || "User"}
      </h1>

      <div
        className="flex-1 overflow-y-auto border rounded p-2 mb-4"
        style={{ minHeight: "300px" }}
      >
        {messages.length === 0 ? (
          <p className="text-gray-500 text-sm">No messages yet.</p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="text-sm mb-1">
              <span className="font-medium">{m.username || "Server"}:</span>{" "}
              {m.text || JSON.stringify(m)}
            </div>
          ))
        )}
      </div>

      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={connected ? "Type a message..." : "Connecting..."}
          disabled={!connected}
          className="flex-1 border rounded px-2 py-1"
        />
        <button
          type="submit"
          disabled={!connected || !input.trim()}
          className="bg-blue-600 text-white px-4 py-1 rounded"
        >
          Send
        </button>
      </form>

      <p className="text-xs text-gray-500 mt-2">
        Status: {connected ? "🟢 Connected" : "🔴 Disconnected"}
      </p>
    </div>
  );
}

window.MainIndex = MainIndex;
