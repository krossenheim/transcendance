import React, { useCallback, useEffect, useState, useRef } from "react";

import {
  StartNewPongGameSchema,
  MovePaddlePayloadScheme,
  GameStateSchema,
  type TypeMovePaddlePayloadScheme,
  type TypeStartNewPongGame,
  type TypeGameStateSchema,
} from "../../../nodejs_base_image/utils/api/service/pong/pong_interfaces";
import { useWebSocket } from "./socketComponent";
import { user_url } from "../../../nodejs_base_image/utils/api/service/common/endpoints";
import { InputEventHandler } from "react";
import InputTracker from "./inputHandlerComponent";
const BACKEND_WIDTH = 1000;
const BACKEND_HEIGHT = 1000;
const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 500;
// =========================
// Map backend coordinates to canvas
// =========================
function mapToCanvas(x: number, y: number) {
  const scaleX = CANVAS_WIDTH / BACKEND_WIDTH;
  const scaleY = CANVAS_HEIGHT / BACKEND_HEIGHT;
  return {
    x: x * scaleX,
    y: y * scaleY,
  };
}

// =========================
// Component
// =========================
export default function PongComponent() {
  const { socket, payloadReceived } = useWebSocket();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // =========================
  // State
  // =========================
  const [payloadInput, setPayloadInput] = useState("{}");
  const [gameState, setGameState] = useState<TypeGameStateSchema>({
    balls: [],
    paddles: [],
    edges: [],
  });

  // player controls
  const keysToTrackP1 = ["w", "s"];
  const keysToTrackP2 = ["o", "l"];

  const [keyStatesPlayer1, setKeyStatesPlayer1] = useState<
    Record<string, 0 | 1>
  >(() => keysToTrackP1.reduce((acc, key) => ({ ...acc, [key]: 0 }), {}));

  const [keyStatesPlayer2, setKeyStatesPlayer2] = useState<
    Record<string, 0 | 1>
  >(() => keysToTrackP2.reduce((acc, key) => ({ ...acc, [key]: 0 }), {}));

  // =========================
  // Handle incoming GameState from payloadReceived
  // =========================
  function attemptSendToServer(serialized: string): boolean {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(serialized));
      return true;
    }
    return false;
  }

  // Setter for parsed.data, leave it alone.
  useEffect(() => {
    if (!payloadReceived) return;

    if (payloadReceived.funcId === user_url.ws.pong.getGameState.funcId) {
      const parsed = GameStateSchema.safeParse(payloadReceived.payload);
      if (parsed.success) {
        setGameState(parsed.data);
      } else {
        console.warn("Invalid GameState payload:", parsed.error);
      }
    }
  }, [payloadReceived]);

  // input handlers
  const handleMove = useCallback(
    (payload: TypeStartNewPongGame) => {
      const toSend = JSON.stringify({
        funcId: user_url.ws.pong.movePaddle.funcId,
        payload,
        target_container: user_url.ws.pong.movePaddle.container,
      });
      const sent = attemptSendToServer(toSend);
      if (!sent) {
        console.warn("Could not send: ", toSend);
      }
    },
    [socket]
  );
  // =========================
  // Outgoing frame handlers
  // =========================

  // const handleSendStartNewGame = useCallback(
  //   (payload: TypeStartNewPongGame) => {
  //     const sent = attemptSendToServer(
  //       JSON.stringify({
  //         funcId: user_url.ws.pong.startGame.funcId,
  //         payload,
  //       target_container: user_url.ws.pong.startGame.container,
  //       })
  //     );
  //     if (!sent) {
  //       console.warn("");
  //     }
  //   },
  //   [socket]
  // );

  // inputs useffect

  const handleSendMovePaddle = useCallback(
    (payload: TypeMovePaddlePayloadScheme) => {
      if (socket.current && socket.current.readyState === WebSocket.OPEN) {
        socket.current.send(
          JSON.stringify({
            funcId: user_url.ws.pong.movePaddle.funcId,
            payload,
            target_container: "pong",
          })
        );
      } else {
        console.warn("WebSocket not open, cannot send MovePaddle");
      }
    },
    [socket]
  );

  // =========================
  // Canvas rendering useffect
  // =========================
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw edges
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 2;
    ctx.beginPath();

    gameState.edges.forEach((edge, i) => {
      const nextEdge = gameState.edges[(i + 1) % gameState.edges.length];
      const { x: x1, y: y1 } = mapToCanvas(edge.x, edge.y);
      const { x: x2, y: y2 } = mapToCanvas(nextEdge.x, nextEdge.y);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    });

    ctx.stroke();

    // Draw paddles
    gameState.paddles.forEach((p) => {
      const { x: canvasX, y: canvasY } = mapToCanvas(p.x, p.y);
      const width = (p.w * CANVAS_WIDTH) / BACKEND_WIDTH;
      const length = (p.l * CANVAS_HEIGHT) / BACKEND_HEIGHT;

      // Recompute angle to center using scaled coordinates
      const dx = canvasX - CANVAS_WIDTH / 2;
      const dy = canvasY - CANVAS_HEIGHT / 2;
      const visualR = Math.atan2(dy, dx);

      ctx.save();
      ctx.translate(canvasX, canvasY);
      ctx.rotate(visualR);

      ctx.fillStyle = "#00ffcc";
      ctx.fillRect(-width / 2, -length / 2, width, length);
      ctx.restore();
    });

    // Draw balls
    gameState.balls.forEach((b) => {
      const { x: canvasX, y: canvasY } = mapToCanvas(b.x, b.y);
      ctx.fillStyle = "#ff4081";
      ctx.beginPath();
      ctx.arc(canvasX, canvasY, 8, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [gameState]);

  // =========================
  // Simple UI
  // =========================

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-black p-4 space-y-4">
      <InputTracker
        keys={keysToTrackP1}
        keyStates={keyStatesPlayer1}
        setKeyStates={setKeyStatesPlayer1}
      />
      <InputTracker
        keys={keysToTrackP2}
        keyStates={keyStatesPlayer2}
        setKeyStates={setKeyStatesPlayer2}
      />
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="rounded-2xl shadow-lg border border-gray-800"
      />
      <div className="flex space-x-2">
        <input
          type="text"
          value={payloadInput}
          onChange={(e) => setPayloadInput(e.target.value)}
          className="border rounded px-2 py-1 w-64"
        />
      </div>
    </div>
  );
}
