import React, { useCallback, useEffect, useState, useRef } from "react";

interface PongComponentProps {
  webSocket: WebSocket;
  ServiceName: string;
}

export default function PongComponent({
  webSocket,
  ServiceName,
}: PongComponentProps) {
  // =========================
  // Incoming frame handlers (formerly handleXReceived)
  // =========================
  const handleSchemaPending1 = useCallback((data) => {
    console.log("SchemaPending1 received:", data);
  }, []);

  const handleSchemaPending2 = useCallback((data) => {
    console.log("SchemaPending2 received:", data);
  }, []);

  const handleSchemaPending3 = useCallback((data) => {
    console.log("SchemaPending3 received:", data);
  }, []);

  // =========================
  // Outgoing frame handlers (formerly handleSendX)
  // =========================
  const handleSendSchemaPending1 = useCallback(
    (payload) => {
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        const toSend = {
          funcId: "SchemaPending1",
          payload,
          target_container: "pong",
        };
        webSocket.send(JSON.stringify(toSend));
        console.log("Sent SchemaPending1:", toSend);
      } else console.warn("WebSocket not open, cannot send message.");
    },
    [webSocket]
  );

  const handleSendSchemaPending2 = useCallback(
    (payload) => {
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        const toSend = {
          funcId: "SchemaPending1",
          payload,
          target_container: "pong",
        };
        webSocket.send(JSON.stringify(toSend));
        console.log("Sent SchemaPending2:", toSend);
      } else console.warn("WebSocket not open, cannot send message.");
    },
    [webSocket]
  );

  // =========================
  // WebSocket routing
  // =========================
  useEffect(() => {
    if (!webSocket) return;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data || data.source_container !== "pong") return;

        switch (data.funcId) {
          case "SchemaPending1":
            handleSchemaPending1(data.payload);
            break;
          case "SchemaPending2":
            handleSchemaPending2(data.payload);
            break;
          case "SchemaPending3":
            handleSchemaPending3(data.payload);
            break;
          default:
            console.warn("Unknown funcId:", data.funcId);
        }
      } catch (err) {
        console.warn("Invalid message format:", err, "message:", event.data);
      }
    };

    webSocket.addEventListener("message", handleMessage);
    return () => webSocket.removeEventListener("message", handleMessage);
  }, [
    webSocket,
    handleSchemaPending1,
    handleSchemaPending2,
    handleSchemaPending3,
  ]);

  // =========================
  // Canvas state
  // =========================
  const [ball, setBall] = useState([{ x: 200, y: 150, vx: 3, vy: 2 }]);
  const [paddle, setPaddle] = useState([{ x: 50, y: 100, vy: 0 }]);
  const canvasRef = useRef(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    paddle.forEach((p) => {
      ctx.fillStyle = "#00ffcc";
      ctx.fillRect(p.x, p.y, 10, 60);
    });

    ball.forEach((b) => {
      ctx.fillStyle = "#ff4081";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [ball, paddle]);

  // =========================
  // Simple UI for sending a "frame" payload
  // =========================
  const [payloadInput, setPayloadInput] = useState("{}");

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-black p-4 space-y-4">
      <canvas
        ref={canvasRef}
        width={800}
        height={400}
        className="rounded-2xl shadow-lg border border-gray-800"
      />
      <div className="flex space-x-2">
        <input
          type="text"
          value={payloadInput}
          onChange={(e) => setPayloadInput(e.target.value)}
          className="border rounded px-2 py-1 w-64"
        />
        <button
          onClick={() => {
            try {
              handleSendSchemaPending1(JSON.parse(payloadInput));
            } catch {
              console.warn("Invalid JSON payload");
            }
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Send Frame
        </button>
      </div>
    </div>
  );
}
