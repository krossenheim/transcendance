import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  GameStateSchema,
  type TypeMovePaddlePayloadScheme,
  type TypeStartNewPongGame,
  type TypeGameStateSchema,
} from "../../../nodejs_base_image/utils/api/service/pong/pong_interfaces";
import { useWebSocket } from "./socketComponent";
import { user_url } from "../../../nodejs_base_image/utils/api/service/common/endpoints";

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
  return { x: x * scaleX, y: y * scaleY };
}

// =========================
// Component
// =========================
export default function PongComponent() {
  const { socket, payloadReceived } = useWebSocket();
  const [game_id, setGame_id] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<TypeGameStateSchema>({
    game_id: 1,
    balls: [],
    paddles: [],
    edges: [],
  });

  // =========================
  // Handle incoming GameState
  // =========================

  const handleListRoomsSchemaReceived = useCallback(
    (newgame: TypeGameStateSchema) => {
      setGame_id(game_id);
    },
    [socket]
  );

  useEffect(() => {
    if (!payloadReceived) return;

    if (payloadReceived.funcId === user_url.ws.pong.startGame.funcId) {
      const parsed =
        user_url.ws.pong.startGame.schema.responses.GameInstanceCreated.payload.safeParse(
          payloadReceived.payload
        );
      console.log("running1");
      if (parsed.success) setGame_id(parsed.data.game_id);
      else console.warn("Invalid new game payload:", parsed.error);
    } else if (
      payloadReceived.funcId === user_url.ws.pong.getGameState.funcId
    ) {
      console.log("running12");
      const parsed =
        user_url.ws.pong.getGameState.schema.responses.GameUpdate.payload.safeParse(
          payloadReceived.payload
        );
      if (parsed.success) setGameState(parsed.data);
      else console.warn("Invalid GameState payload:", parsed.error);
    }
  }, [payloadReceived]);

  // =========================
  // WebSocket Send Helpers
  // =========================
  const handleSendStartNewGame = useCallback(
    (payload: TypeStartNewPongGame) => {
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(
          JSON.stringify({
            funcId: user_url.ws.pong.startGame.funcId,
            payload,
            target_container: user_url.ws.pong.startGame.container,
          })
        );
      } else {
        console.warn("WebSocket not open, cannot send StartNewGame");
      }
    },
    [socket]
  );

  const handleSendMovePaddle = useCallback(
    (payload: TypeMovePaddlePayloadScheme) => {
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(
          JSON.stringify({
            funcId: user_url.ws.pong.movePaddle.funcId,
            payload,
            target_container: user_url.ws.pong.movePaddle.container,
          })
        );
      } else {
        console.warn("WebSocket not open, cannot send MovePaddle");
      }
    },
    [socket]
  );

  // =========================
  // Keyboard input (W / S)
  // =========================
  useEffect(() => {
    const keysPressed = new Set<string>();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "w" && e.key !== "s") return;
      if (keysPressed.has(e.key)) return; // already pressed, ignore
      keysPressed.add(e.key);

      const payload = {
        board_id: game_id,
        m: e.key === "w",
      };
      handleSendMovePaddle(payload);
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key !== "w" && e.key !== "s") return;
      keysPressed.delete(e.key);

      const payload = {
        board_id: game_id,
        m: null, // stop movement
      };
      handleSendMovePaddle(payload);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleSendMovePaddle, game_id]);

  // =========================
  // Canvas Rendering
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

      ctx.save();
      ctx.translate(canvasX, canvasY);
      ctx.rotate(p.r);
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
  // Simple UI for Start Game
  // =========================
  const [playerListInput, setPlayerListInput] = useState("4,5,6,7,8");
  const [ballInput, setBallInput] = useState<number>(1);

  const handleStartGameClick = useCallback(() => {
    const ids = playerListInput
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((x) => !isNaN(x));

    const payload: TypeStartNewPongGame = {
      player_list: ids,
      balls: ballInput,
    };
    handleSendStartNewGame(payload);
  }, [playerListInput, ballInput, handleSendStartNewGame]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-grey p-4 space-y-4">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="rounded-2xl shadow-lg border border-gray-800"
      />

      <div className="flex space-x-2">
        <input
          type="text"
          value={playerListInput}
          onChange={(e) => setPlayerListInput(e.target.value)}
          className="border rounded px-2 py-1 w-64"
          placeholder="Enter player IDs (e.g. 4,5,6,7,8)"
        />
        <input
          type="text"
          value={ballInput}
          onChange={(e) => {
            const num = parseInt(e.target.value, 10);
            setBallInput(isNaN(num) ? 0 : num);
          }}
          className="border rounded px-2 py-1 w-64"
          placeholder="Enter player IDs (e.g. 4,5,6,7,8)"
        />
        <button
          onClick={handleStartGameClick}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Start Game
        </button>
      </div>
    </div>
  );
}
