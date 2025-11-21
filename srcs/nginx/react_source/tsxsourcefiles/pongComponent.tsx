"use client"

import { useCallback, useEffect, useState, useRef } from "react"
import type {
  TypeMovePaddlePayloadScheme,
  TypeStartNewPongGame,
  TypeGameStateSchema,
  TypePlayerReadyForGameSchema,
  TypePlayerDeclaresReadyForGame,
} from "@/types/pong-interfaces"
import { useWebSocket } from "./socketComponent"
import { user_url } from "../../../nodejs_base_image/utils/api/service/common/endpoints"
import type { AuthResponseType } from "@/types/auth-response"
import BabylonPongRenderer from "./BabylonPongRenderer"

// =========================
// Component
// =========================
export default function PongComponent({ authResponse }: { authResponse: AuthResponseType | null }) {
  const { socket, payloadReceived } = useWebSocket()
  const [latestPlayerReadyPayload, setLatestPlayerReadyPayload] = useState<TypePlayerReadyForGameSchema | null>(null)
  const [gameSelectedInput, setGameSelectedInput] = useState<number>(1)
  const [gameState, setGameState] = useState<TypeGameStateSchema | null>(null)
  const [playerOnePaddleID, setPlayerOnePaddleID] = useState<number>(-1)
  const [playerTwoPaddleID, setPlayerTwoPaddleID] = useState<number>(-2)
  const gameStateReceivedRef = useRef<boolean>(false)
  const retryIntervalRef = useRef<number | null>(null)
  const [lastCreatedBoardId, setLastCreatedBoardId] = useState<number | null>(null)

  // Cleanup polling on unmount (in case any leftover intervals exist)
  useEffect(() => {
    return () => {
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current)
        retryIntervalRef.current = null
      }
    }
  }, [])

  // =========================
  // Fetch game state on mount
  // =========================
  useEffect(() => {
    if (!socket.current) {
      console.log("[Pong] Socket not ready yet");
      return;
    }
    
    // Only request game state if socket is ready
    const attemptGameStateRequest = () => {
      if (socket.current && socket.current.readyState === WebSocket.OPEN) {
        console.log("[Pong] Requesting game state...");
        console.log("[Pong] getGameState config:", {
          funcId: user_url.ws.pong.getGameState.funcId,
          container: user_url.ws.pong.getGameState.container,
        });
        const payload = {
          funcId: user_url.ws.pong.getGameState.funcId,
          payload: {},
          target_container: user_url.ws.pong.getGameState.container,
        };
        const strToSend = JSON.stringify(payload);
        console.log("[Pong] Sending payload:", strToSend);
        socket.current.send(strToSend);
        console.log("[Pong] Game state request sent");
      } else {
        console.warn("[Pong] WebSocket not ready, retrying in 500ms");
        setTimeout(attemptGameStateRequest, 500);
      }
    };
    
    attemptGameStateRequest();
  }, [socket]);

  // =========================
  // Handle incoming GameState
  // =========================

  const aPlayerHasReadied = useCallback(
    (player_readied_info: TypePlayerReadyForGameSchema) => {
      console.log(
        `Player with ID '${player_readied_info.user_id}' is ready for game with ID '${player_readied_info.game_id}'`,
      )
    },
    [latestPlayerReadyPayload],
  )

  const setPlayerIDsHelper = useCallback(
    (game_data: TypeGameStateSchema) => {
      if (!game_data) {
        console.log("[Pong] setPlayerIDsHelper: game_data is null");
        return;
      }
      if (!authResponse) {
        console.log("[Pong] setPlayerIDsHelper: authResponse is null");
        return;
      }
      console.log("[Pong] setPlayerIDsHelper called with game_data:", game_data);
      console.log("[Pong] authResponse.user.id:", authResponse.user.id);
      let odd = true;
      for (const paddle of game_data.paddles) {
        console.log("[Pong] Checking paddle:", paddle.paddle_id, "owner_id:", paddle.owner_id);
        if (paddle.owner_id === authResponse.user.id) {
          if (odd) {
            setPlayerOnePaddleID(paddle.paddle_id);
            console.log("[Pong] Set playerOnePaddleID:", paddle.paddle_id);
            odd = false;
          } else {
            setPlayerTwoPaddleID(paddle.paddle_id);
            console.log("[Pong] Set playerTwoPaddleID:", paddle.paddle_id);
          }
        }
      }
    },
    [authResponse],
  )

  useEffect(() => {
    if (!payloadReceived) {
      console.log("[Pong] No payloadReceived yet");
      return;
    }

    console.log("[Pong] Processing payload:", payloadReceived);

    for (const webSocketRoute of Object.values(user_url.ws.pong)) {
      if (payloadReceived.funcId !== webSocketRoute.funcId) continue;

      console.log("[Pong] Found matching route for funcId:", payloadReceived.funcId);

      const responseSchema = Object.values(webSocketRoute.schema.output).find(
        (r) => r.code === payloadReceived.code
      );

      if (!responseSchema) {
        console.error("Unknown code", payloadReceived.code);
        return;
      }

      console.log("[Pong] Found responseSchema, parsing payload...");

      const parsed = responseSchema.payload.safeParse(payloadReceived.payload);
      if (!parsed.success) {
        console.warn("Invalid payload", parsed.error);
        return;
      }

      console.log("[Pong] Payload parsed successfully:", parsed.data);

      // Update the appropriate state slice based on funcId
      switch (payloadReceived.funcId) {
        case user_url.ws.pong.getGameState.funcId:
          if (
            payloadReceived.code !==
            user_url.ws.pong.getGameState.schema.output.GameUpdate.code
          ) {
            console.warn("[Pong] getGameState returned non-GameUpdate code:", payloadReceived.code);
            console.warn("[Pong] Payload:", payloadReceived.payload);
            if (payloadReceived.code === user_url.ws.pong.getGameState.schema.output.NotInRoom.code) {
              console.log("[Pong] User not in any game room - this is normal if no game exists");
            }
            break;
          }
          console.log("[Pong] Setting gameState:", parsed.data);
          setGameState(parsed.data);
          gameStateReceivedRef.current = true;
          setPlayerIDsHelper(parsed.data);
          break;
        case user_url.ws.pong.startGame.funcId:
          console.log("[Pong] Game started, received game info:", parsed.data);
          if (parsed.data && typeof parsed.data.board_id === 'number') {
            setLastCreatedBoardId(parsed.data.board_id)
          }
          // Game has been created, now request the game state once
          const requestGameStatePayload = {
            funcId: user_url.ws.pong.getGameState.funcId,
            payload: {},
            target_container: user_url.ws.pong.getGameState.container,
          };
          if (socket.current?.readyState === WebSocket.OPEN) {
            socket.current.send(JSON.stringify(requestGameStatePayload));
            console.log("[Pong] Requested game state after game creation (handler will respond)");
          }
          break;
        case user_url.ws.pong.userReportsReady.funcId:
          console.log("[Pong] Player ready:", parsed.data);
          setLatestPlayerReadyPayload(parsed.data);
          break;
        // Add other funcIds here...
      }

      return; // stop after first match
    }
  }, [payloadReceived, setPlayerIDsHelper]);

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

  const handleUserInput = useCallback(
    (wshandlerinfo: any, payload: any) => {
      const strToSend = JSON.stringify({
        funcId: wshandlerinfo.funcId,
        payload: payload,
        target_container: wshandlerinfo.container,
      })
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(strToSend)
      } else {
        console.warn("WebSocket not open, cannot send:", wshandlerinfo.funcId)
      }
    },
    [socket],
  )

  // =========================
  // Keyboard input (W / S)
  // =========================
  useEffect(() => {
    const keysPressed = new Set<string>()
    function handleKeyDown(e: KeyboardEvent) {
      if (gameState === null) return
      if (e.key !== "w" && e.key !== "s") return
      if (keysPressed.has(e.key)) return
      keysPressed.add(e.key)

      if (gameState.board_id === null) return
      const payload: TypeMovePaddlePayloadScheme = {
        board_id: gameState.board_id,
        paddle_id: playerOnePaddleID,
        m: e.key === "w",
      }
      handleUserInput(user_url.ws.pong.movePaddle, payload)
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (gameState === null || playerOnePaddleID === -1) return
      if (e.key !== "w" && e.key !== "s") return
      keysPressed.delete(e.key)

      const payload = {
        board_id: gameState.board_id,
        paddle_id: playerOnePaddleID,
        m: null,
      }
      handleUserInput(user_url.ws.pong.movePaddle, payload)
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [gameState, handleUserInput, playerOnePaddleID])

  // =========================
  // Keyboard input (O / L)
  // =========================
  useEffect(() => {
    const keysPressed = new Set<string>()
    function handleKeyDown(e: KeyboardEvent) {
      if (gameState === null || playerTwoPaddleID === -1) return
      if (e.key !== "o" && e.key !== "l") return
      if (keysPressed.has(e.key)) return
      keysPressed.add(e.key)

      if (gameState.board_id === null) return
      const payload: TypeMovePaddlePayloadScheme = {
        board_id: gameState.board_id,
        paddle_id: playerTwoPaddleID,
        m: e.key === "o",
      }
      handleUserInput(user_url.ws.pong.movePaddle, payload)
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (gameState === null) return
      if (e.key !== "o" && e.key !== "l") return
      keysPressed.delete(e.key)

      const payload = {
        board_id: gameState.board_id,
        paddle_id: playerTwoPaddleID,
        m: null,
      }
      handleUserInput(user_url.ws.pong.movePaddle, payload)
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [gameState, handleUserInput, playerTwoPaddleID])

  // =========================
  // 3D Rendering is handled by BabylonPongRenderer component
  // =========================

  // =========================
  // Simple UI for Start Game
  // =========================
  const [playerListInput, setPlayerListInput] = useState("4,5,6,7,8")
  const [ballInput, setBallInput] = useState(1)

  const handleStartGameClick = useCallback(() => {
    console.log("[Pong] Start Game clicked");
    const ids = playerListInput
      .split(",")
      .map((x) => Number.parseInt(x.trim(), 10))
      .filter((x) => !isNaN(x))

    console.log("[Pong] Parsed player IDs:", ids);

    const payload: TypeStartNewPongGame = {
      player_list: ids,
      balls: ballInput,
    }
    console.log("[Pong] Sending start game payload:", payload);
    handleUserInput(user_url.ws.pong.startGame, payload)
  }, [playerListInput, ballInput, handleUserInput])

  const handleDeclareReadyClick = useCallback(
    (readyForWhichId: number) => {
      const payload: TypePlayerDeclaresReadyForGame = {
        game_id: readyForWhichId,
      }
      handleUserInput(user_url.ws.pong.userReportsReady, payload)
    },
    [handleUserInput],
  )

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-gray-50 dark:bg-dark-600 p-4 space-y-4">
      <div className="w-full flex-1 min-h-[500px] rounded-2xl shadow-lg border border-gray-800 bg-black overflow-hidden">
        <BabylonPongRenderer gameState={gameState} />
      </div>

      {!gameState && (
        <div className="text-sm text-gray-600 dark:text-gray-300">Waiting for game state...</div>
      )}

      {/* Debug overlay: visible, always-on button to start a game (helps diagnose missing buttons) */}
      <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 9999 }}>
        <button
          onClick={() => {
            console.log("[Pong][DEBUG] Overlay Start Game clicked")
            const ids = playerListInput
              .split(",")
              .map((x) => Number.parseInt(x.trim(), 10))
              .filter((x) => !isNaN(x))
            const payload: TypeStartNewPongGame = { player_list: ids, balls: ballInput }
            handleUserInput(user_url.ws.pong.startGame, payload)
          }}
          style={{ backgroundColor: "#2563eb", color: "white", padding: "8px 12px", borderRadius: 8 }}
        >
          DEBUG: Start Game
        </button>
        {lastCreatedBoardId !== null && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => {
                console.log("[Pong][DEBUG] Overlay Declare Ready clicked, board:", lastCreatedBoardId)
                const payload = { game_id: lastCreatedBoardId }
                handleUserInput(user_url.ws.pong.userReportsReady, payload)
              }}
              style={{ backgroundColor: "#059669", color: "white", padding: "8px 12px", borderRadius: 8 }}
            >
              DEBUG: Declare Ready
            </button>
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => {
              console.log("[Pong][DEBUG] Start Solo & Ready clicked")
              if (!authResponse) {
                console.warn("[Pong][DEBUG] No authResponse, cannot start solo game")
                return
              }
              const myId = authResponse.user?.id
              if (!myId) {
                console.warn("[Pong][DEBUG] authResponse has no user id")
                return
              }
              const payload: TypeStartNewPongGame = { player_list: [myId], balls: ballInput }
              handleUserInput(user_url.ws.pong.startGame, payload)
              // after we get start_game reply, polling will request game state; also auto-ready when board id known
            }}
            style={{ backgroundColor: "#f59e0b", color: "white", padding: "8px 12px", borderRadius: 8 }}
          >
            DEBUG: Start Solo & Ready
          </button>
        </div>
      </div>

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
          placeholder="Number of balls"
        />
        <button onClick={handleStartGameClick} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
          Start Game
        </button>
      </div>
      <div className="flex bg-green-300 space-x-2">
        <input
          type="text"
          value={gameSelectedInput}
          onChange={(e) => setGameSelectedInput(Number(e.target.value))}
          className="border rounded px-2 py-1 w-64"
          placeholder="Game ID"
        />
        <button
          onClick={() => {
            handleDeclareReadyClick(gameSelectedInput)
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Declare Ready
        </button>
      </div>
    </div>
  )
}
