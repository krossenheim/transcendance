import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  GameStateSchema,
  type TypeMovePaddlePayloadScheme,
  type TypeStartNewPongGame,
  type TypeGameStateSchema,
  TypePlayerReadyForGameSchema,
  TypePlayerDeclaresReadyForGame,
} from "../../../nodejs_base_image/utils/api/service/pong/pong_interfaces";
import { useWebSocket } from "./socketComponent";
import {
  user_url,
  WebSocketRouteDef,
  WSResponseType,
} from "../../../nodejs_base_image/utils/api/service/common/endpoints";
import { z } from "zod";
import user from "../../../nodejs_base_image/utils/api/service/db/user";
import { InfoIcon } from "lucide-react";

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
  const [latestPlayerReadyPayload, setLatestPlayerReadyPayload] =
    useState<TypePlayerReadyForGameSchema | null>(null);
  const [gameSelectedInput, setGameSelectedInput] = useState<number>(1);
  const [gameState, setGameState] = useState<TypeGameStateSchema | null>(null);
  const [playerOnePaddleID, setPlayerOnePaddleID] = useState<number>(-1);
  const [playerTwoPaddleID, setPlayerTwoPaddleID] = useState<number>(-2);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // =========================
  // Handle incoming GameState
  // =========================

  const aPlayerHasReadied = useCallback(
    (player_readied_info: TypePlayerReadyForGameSchema) => {
      console.log(
        `Player with ID '${player_readied_info.user_id}' is ready for game with ID '${player_readied_info.game_id}'`
      );
      // A toast on the screen would suffice, with a link that loads a pongcomponent i guess.
    },
    [latestPlayerReadyPayload]
  );

  const onFirstGameStatereceived = useCallback(
    (game_has_started_data: TypeGameStateSchema) => {
      console.log(`Game started: '${game_has_started_data.board_id}'`);
      // A toast on the screen would suffice, with a link that loads a pongcomponent i guess.
    },
    [gameState]
  );

  useEffect(() => {
    if (!payloadReceived) return;

    for (const webSocketRoute of Object.values(user_url.ws.pong)) {
      if (payloadReceived.funcId !== webSocketRoute.funcId) continue;

      const responseSchema = Object.values(webSocketRoute.schema.output).find(
        (r) => r.code === payloadReceived.code
      );

      if (!responseSchema) {
        console.error("Unknown code", payloadReceived.code);
        return;
      }

      const parsed = responseSchema.payload.safeParse(payloadReceived.payload);
      if (!parsed.success) {
        console.warn("Invalid payload", parsed.error);
        return;
      }

      // Update the appropriate state slice based on funcId
      switch (payloadReceived.funcId) {
        case user_url.ws.pong.getGameState.funcId:
          if (
            payloadReceived.code !==
            user_url.ws.pong.getGameState.schema.output.GameUpdate.code
          )
            break;
          setGameState(parsed.data);
          break;
        case user_url.ws.pong.userReportsReady.funcId:
          setLatestPlayerReadyPayload(parsed.data);
          break;
        // Add other funcIds here...
      }

      return; // stop after first match
    }
  }, [payloadReceived]);

  // useEffect(() => {
  //   if (!payloadReceived) return;

  //   if (payloadReceived.funcId === user_url.ws.pong.startGame.funcId) {
  //     const parsed =
  //       user_url.ws.pong.startGame.schema.output.GameInstanceCreated.payload.safeParse(
  //         payloadReceived.payload
  //       );
  //     if (parsed.success) setGame_id(parsed.data.board_id);
  //     else console.warn("Invalid new game payload:", parsed.error);
  //   } else if (
  //     payloadReceived.funcId === user_url.ws.pong.getGameState.funcId
  //   ) {
  //     const parsed =
  //       user_url.ws.pong.getGameState.schema.output.GameUpdate.payload.safeParse(
  //         payloadReceived.payload
  //       );
  //     if (parsed.success) {
  //       if (game_id === null) setGame_id(parsed.data.board_id); // Client rejoined
  //       setGameState(parsed.data);
  //     } else console.warn("Invalid GameState payload:", parsed.error);
  //   }
  // }, [payloadReceived]);

  // // =========================
  // WebSocket Send Helpers
  // =========================

  const handleUserInput = useCallback<
    <T extends WebSocketRouteDef>(
      wshandlerinfo: T,
      payload: z.infer<T["schema"]["args"]>
    ) => void
  >(
    (wshandlerinfo, payload) => {
      const strToSend = JSON.stringify({
        funcId: wshandlerinfo.funcId,
        payload: payload,
        target_container: wshandlerinfo.container,
      });
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(strToSend);
      } else {
        console.warn("WebSocket not open, cannot send:", wshandlerinfo.funcId);
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
      if (gameState === null) return;
      if (e.key !== "w" && e.key !== "s") return;
      if (keysPressed.has(e.key)) return; // already pressed, ignore
      keysPressed.add(e.key);

      if (gameState.board_id === null) return;
      const payload: TypeMovePaddlePayloadScheme = {
        board_id: gameState.board_id,
        paddle_id: playerOnePaddleID,
        m: e.key === "w",
      };
      handleUserInput(user_url.ws.pong.movePaddle, payload);
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (gameState === null) return;
      if (e.key !== "w" && e.key !== "s") return;
      keysPressed.delete(e.key);

      const payload = {
        board_id: gameState.board_id,
        paddle_id: playerOnePaddleID,
        m: null, // stop movement
      };
      handleUserInput(user_url.ws.pong.movePaddle, payload);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [gameState]);

  // =========================
  // Canvas Rendering
  // =========================
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !gameState || !gameState.edges) return;

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
  const [ballInput, setBallInput] = useState(1);

  const handleStartGameClick = useCallback(() => {
    const ids = playerListInput
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((x) => !isNaN(x));

    const payload: TypeStartNewPongGame = {
      player_list: ids,
      balls: ballInput,
    };
    handleUserInput(user_url.ws.pong.startGame, payload);
  }, [playerListInput, ballInput, handleUserInput]);

  const handleDeclareReadyClick = useCallback((readyForWhichId: number) => {
    const payload: TypePlayerDeclaresReadyForGame = {
      game_id: readyForWhichId,
    };
    handleUserInput(user_url.ws.pong.userReportsReady, payload);
  }, []);

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
          onChange={(e) => setBallInput(Number(e.target.value))}
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
      <div className="flex bg-green-300 space-x-2">
        <input
          type="text"
          value={gameSelectedInput}
          onChange={(e) => setGameSelectedInput(Number(e.target.value))}
          className="border rounded px-2 py-1 w-64"
          placeholder="Enter player IDs (e.g. 4,5,6,7,8)"
        />
        <button
          onClick={() => {
            handleDeclareReadyClick(gameSelectedInput);
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Declare Ready{" "}
        </button>
      </div>
    </div>
  );
}
