let ws;

if (!ws || ws.readyState === WebSocket.CLOSED) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = protocol + "//" + window.location.host + "/ws";
  console.log("Opening ssocket: " + wsUrl);

  ws = new WebSocket(wsUrl);

  ws.addEventListener('open', () => {
    console.log('Connected to ' + wsUrl);
  });

  // add one of these after each import for each context. pong, chat. i hope.
  // ws.addEventListener('message', (event) => {
  //   console.log('Message from server:', event.data);
  // });

  ws.addEventListener('close', () => {
    console.log('Disconnected from WebSocket server');
  });
}

export default ws;


