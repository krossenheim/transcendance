"use client"

import { useCallback, useEffect, useState, useRef } from "react"
import type {
  TypeHandleGameKeysSchema,
  TypeStartNewPongGame,
  TypeGameStateSchema,
  TypePlayerReadyForGameSchema,
  TypePlayerDeclaresReadyForGame,
} from "./types/pong-interfaces"
import { useWebSocket } from "./socketComponent"
import { user_url } from "@app/shared/api/service/common/endpoints"
import type { AuthResponseType } from "./types/auth-response"
import BabylonPongRenderer from "./BabylonPongRenderer"
import PongInviteModal, { type GameMode, type GameSettings } from "./pongInviteModal"
import PongLobby, { type PongLobbyData } from "./pongLobby"
import TournamentBracket, { type TournamentData } from "./tournamentBracket"
import TournamentStats from "./tournamentStats"
import { type PongInvitation } from "./pongInviteNotifications"
import user from "@app/shared/api/service/db/user"
import { ClientPongSimulation } from "./pong/physics"

// =========================
// Component
// =========================
export default function PongComponent({
  authResponse,
  darkMode = true,
  showInviteModal = false,
  inviteRoomUsers = [],
  onCloseInviteModal,
  pongInvitations,
  setPongInvitations,
  acceptedLobbyId,
  onLobbyJoined,
  onNavigateToChat
}: {
  authResponse: AuthResponseType | null
  darkMode?: boolean
  pongInvitations: PongInvitation[]
  setPongInvitations: React.Dispatch<React.SetStateAction<PongInvitation[]>>
  showInviteModal?: boolean
  inviteRoomUsers?: Array<{ id: number; username: string; onlineStatus?: number }>
  onCloseInviteModal?: () => void
  acceptedLobbyId?: number | null
  onLobbyJoined?: () => void
  onNavigateToChat?: () => void
}) {
  // Helper: normalize server GameState (tuples) to frontend-friendly objects
  const normalizeGameState = (raw: any) => {
    if (!raw) return null

    // balls: tuple [x,y,dx,dy,radius,inverse_mass] -> { id, x, y, dx, dy }
    const balls = (raw.balls || []).map((b: any, idx: number) => {
      if (Array.isArray(b)) {
        return {
          id: idx,
          x: Number(b[0]) || 0,
          y: Number(b[1]) || 0,
          dx: Number(b[2]) || 0,
          dy: Number(b[3]) || 0,
          radius: Number(b[4]) || 10,
        }
      }
      // already object-shaped
      return {
        id: b.id ?? idx,
        x: b.x ?? 0,
        y: b.y ?? 0,
        dx: b.dx ?? 0,
        dy: b.dy ?? 0,
        radius: b.radius ?? b.r ?? 10,
      }
    })

    // paddles: tuple [x,y,angle,width,height,vx,vy,playerId] -> { x,y,r,w,l,owner_id,paddle_id }
    const paddles = (raw.paddles || []).map((p: any, idx: number) => {
      if (Array.isArray(p)) {
        const owner = Number(p[7]) ?? idx
        return {
          x: Number(p[0]) || 0,
          y: Number(p[1]) || 0,
          r: Number(p[2]) || 0,
          w: Number(p[3]) || 10,
          l: Number(p[4]) || 50,
          owner_id: owner,
          paddle_id: owner,
        }
      }
      return {
        x: p.x ?? 0,
        y: p.y ?? 0,
        r: p.r ?? p.rotation ?? 0,
        w: p.w ?? p.width ?? 10,
        l: p.l ?? p.length ?? 50,
        owner_id: p.owner_id ?? p.ownerId ?? p.player_id ?? p.playerId ?? idx,
        paddle_id: p.paddle_id ?? p.id ?? idx,
      }
    })

    // walls: tuple [ax,ay,bx,by,...] -> edges as polygon points using pointA of each wall
    const edges = (raw.walls || []).map((w: any) => {
      if (Array.isArray(w)) {
        return { x: Number(w[0]) || 0, y: Number(w[1]) || 0 }
      }
      return { x: w.x ?? 0, y: w.y ?? 0 }
    })

    return {
      board_id: raw.board_id ?? raw.boardId ?? null,
      edges,
      paddles,
      balls,
      metadata: raw.metadata ?? null,
      powerups: raw.powerups ?? raw.power_up ?? [],
      score: raw.score ?? null,
    }
  }
  const { socket, payloadReceived } = useWebSocket()
  const [latestPlayerReadyPayload, setLatestPlayerReadyPayload] = useState<TypePlayerReadyForGameSchema | null>(null)
  const [gameSelectedInput, setGameSelectedInput] = useState<number>(1)
  const [gameState, setGameState] = useState<TypeGameStateSchema | null>(null)
  const [playerOnePaddleID, setPlayerOnePaddleID] = useState<number>(-1)
  const [playerTwoPaddleID, setPlayerTwoPaddleID] = useState<number>(-2)
  const gameStateReceivedRef = useRef<boolean>(false)
  const retryIntervalRef = useRef<number | null>(null)
  const [lastCreatedBoardId, setLastCreatedBoardId] = useState<number | null>(null)
  // Renderer controls for tuning paddle rotation and screenshots
  const rendererRef = useRef<any>(null)
  const [paddleRotationOffset, setPaddleRotationOffset] = useState<number>(0)

  // ====================
  // CLIENT-SIDE PREDICTION
  // ====================
  // The simulation runs locally to provide smooth visuals
  // Server state is used to correct any drift
  const clientSimulationRef = useRef<ClientPongSimulation>(new ClientPongSimulation())
  const lastFrameTimeRef = useRef<number>(performance.now())
  const animationFrameRef = useRef<number | null>(null)
  const pressedKeysRef = useRef<Set<string>>(new Set())
  // State that the renderer actually displays (updated by client simulation)
  const [displayState, setDisplayState] = useState<TypeGameStateSchema | null>(null)
  // Track if we've received initial server state
  const hasReceivedServerStateRef = useRef<boolean>(false)
  // Toggle for prediction mode
  const [predictionEnabled, setPredictionEnabled] = useState<boolean>(true)

  // New state for lobby and tournament
  const [currentView, setCurrentView] = useState<"menu" | "lobby" | "game" | "tournament">("menu")
  const [lobby, setLobby] = useState<PongLobbyData | null>(null)
  const [tournament, setTournament] = useState<TournamentData | null>(null)
  const [activeTournamentId, setActiveTournamentId] = useState<number | null>(null) // Track tournament ID during game
  const [showInviteModalLocal, setShowInviteModalLocal] = useState(false)
  const [showTournamentStats, setShowTournamentStats] = useState(false)
  // pongInvitations and setPongInvitations are now passed as props from AppRoot

  // Cleanup polling on unmount (in case any leftover intervals exist)
  useEffect(() => {
    return () => {
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current)
        retryIntervalRef.current = null
      }
    }
  }, [])

  // Cleanup: Leave lobby when component unmounts (user navigates away)
  // Use ref to track current lobby without causing re-renders
  const lobbyRef = useRef(lobby)
  useEffect(() => {
    lobbyRef.current = lobby
  }, [lobby])

  useEffect(() => {
    // Only run cleanup on actual unmount
    return () => {
      if (lobbyRef.current && socket.current?.readyState === WebSocket.OPEN) {
        console.log("[Pong] Component unmounting, leaving lobby:", lobbyRef.current.lobbyId)
        socket.current.send(JSON.stringify({
          funcId: "leave_pong_lobby",
          payload: { lobbyId: lobbyRef.current.lobbyId },
          target_container: "pong",
        }))
      }
    }
  }, [])

  // ====================
  // CLIENT-SIDE PREDICTION ANIMATION LOOP
  // ====================
  // This runs at 60fps and updates the local simulation
  // Provides smooth visuals independent of network latency
  useEffect(() => {
    if (currentView !== "game" || !predictionEnabled) {
      // Not in game or prediction disabled, cancel animation loop
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      // When prediction is disabled, clear display state so we use server state directly
      if (!predictionEnabled) {
        setDisplayState(null)
      }
      return
    }

    const runSimulation = () => {
      const now = performance.now()
      const deltaTime = (now - lastFrameTimeRef.current) / 1000 // Convert to seconds
      lastFrameTimeRef.current = now

      const simulation = clientSimulationRef.current

      // Only run simulation if we have initial state
      if (simulation.isInitialized()) {
        // Clamp deltaTime to avoid huge jumps (e.g., after tab switch)
        const clampedDelta = Math.min(deltaTime, 0.1) // Max 100ms per frame
        simulation.simulate(clampedDelta)

        // Get the predicted state and update display
        const predictedState = simulation.getState()
        setDisplayState({
          board_id: predictedState.board_id,
          edges: predictedState.edges,
          paddles: predictedState.paddles.map(p => ({
            x: p.x,
            y: p.y,
            r: p.r,
            w: p.w,
            l: p.l,
            owner_id: p.owner_id,
            paddle_id: p.paddle_id,
          })),
          balls: predictedState.balls.map(b => ({
            id: b.id,
            x: b.x,
            y: b.y,
            dx: b.dx,
            dy: b.dy,
            radius: b.radius,
          })),
          metadata: predictedState.metadata,
          // Powerups come from server state (not predicted locally)
          powerups: gameState?.powerups || [],
          score: gameState?.score || null, // Use server score
        })
      }

      // Continue animation loop
      animationFrameRef.current = requestAnimationFrame(runSimulation)
    }

    // Start the animation loop
    lastFrameTimeRef.current = performance.now()
    animationFrameRef.current = requestAnimationFrame(runSimulation)

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [currentView, gameState?.score, gameState?.powerups, predictionEnabled])

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
          payload: {
            gameId: lastCreatedBoardId,
          },
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
  // Handle incoming GameState and Lobby updates
  // =========================

  const aPlayerHasReadied = useCallback(
    (player_readied_info: TypePlayerReadyForGameSchema) => {
      console.log(
        `Player with ID '${player_readied_info.user_id}' is ready for game with ID '${player_readied_info.game_id}'`,
      )
    },
    [latestPlayerReadyPayload],
  )

  // Handle incoming pong invitations and lobby updates
  useEffect(() => {
    if (!payloadReceived) return

    // Debug: Log all pong-related messages
    if (payloadReceived.funcId === 'create_pong_lobby' || payloadReceived.funcId === 'pong_lobby_invitation' || payloadReceived.funcId === 'lobby_state_update' || payloadReceived.funcId === 'start_game_from_lobby') {
      console.log("[Pong] DEBUG: Received message:", payloadReceived.funcId, "source_container:", payloadReceived.source_container, "code:", payloadReceived.code)
    }

    if (payloadReceived.source_container !== 'pong') {
      if (payloadReceived.funcId === 'create_pong_lobby' || payloadReceived.funcId === 'start_game_from_lobby') {
        console.log("[Pong] DEBUG:", payloadReceived.funcId, "filtered out! source_container:", payloadReceived.source_container)
      }
      return
    }

    // Handle lobby creation (used as invitation for non-host players)
    if (payloadReceived.funcId === 'create_pong_lobby' && payloadReceived.code === 0) {
      console.log("[Pong] Received lobby creation/invitation:", payloadReceived.payload)

      // Check if we're the host (we created this)
      const isHost = authResponse && payloadReceived.payload.players?.some((p: any) =>
        (p.userId === authResponse.user.id || p.id === authResponse.user.id) && p.isHost
      )

      console.log("[Pong] isHost check: myId=", authResponse?.user.id, "isHost=", isHost, "players=", payloadReceived.payload.players)

      // Note: Invitation notifications are now handled by PongInvitationHandler in AppRoot
      // This handler only sets up the lobby for the host
      if (isHost) {
        // We're the host - go directly to lobby
        setLobby({
          lobbyId: payloadReceived.payload.lobbyId,
          gameMode: payloadReceived.payload.gameMode,
          players: payloadReceived.payload.players.map((p: any) => ({
            id: p.userId || p.id,
            username: p.username,
            isReady: p.isReady,
            isHost: p.isHost,
          })),
          settings: {
            ballCount: payloadReceived.payload.ballCount,
            maxScore: payloadReceived.payload.maxScore,
            allowPowerups: payloadReceived.payload.allowPowerups,
          },
          status: payloadReceived.payload.status,
        })

        // If this is a tournament lobby, capture the SERVER's tournament ID (not the client-generated one)
        if (payloadReceived.payload.tournament?.tournamentId) {
          const serverTournament = payloadReceived.payload.tournament
          console.log("[Pong] Tournament lobby created, setting activeTournamentId:", serverTournament.tournamentId)
          setActiveTournamentId(serverTournament.tournamentId)

          // Set tournament state from server data (overwrite any client-generated tournament)
          setTournament({
            tournamentId: serverTournament.tournamentId,
            name: serverTournament.name || "Tournament",
            mode: serverTournament.mode || payloadReceived.payload.gameMode,
            players: serverTournament.players?.map((p: any) => ({
              id: p.userId || p.id,
              username: p.username || `Player ${p.userId || p.id}`,
              alias: p.alias,
            })) || [],
            matches: serverTournament.matches || [],
            currentRound: serverTournament.currentRound || 1,
            totalRounds: serverTournament.totalRounds || 2,
            status: serverTournament.status || "in_progress",
            winner: serverTournament.winnerId || null,
          })
        }

        setCurrentView("lobby")
      }
    }

    // Handle lobby invitation (legacy support)
    if (payloadReceived.funcId === 'pong_lobby_invitation') {
      console.log("[Pong] Received lobby invitation:", payloadReceived.payload)
      const invitation: PongInvitation = {
        inviteId: payloadReceived.payload.lobbyId || Date.now(),
        lobbyId: payloadReceived.payload.lobbyId,
        hostId: payloadReceived.payload.hostId,
        hostUsername: payloadReceived.payload.hostUsername || `User ${payloadReceived.payload.hostId}`,
        gameMode: payloadReceived.payload.gameMode,
        playerCount: payloadReceived.payload.playerCount || 0,
        timestamp: Date.now(),
      }
      setPongInvitations((prev) => [...prev, invitation])
    }

    // Handle toggle ready response and lobby state updates
    if ((payloadReceived.funcId === 'toggle_player_ready_in_lobby' && payloadReceived.code === 0) ||
      payloadReceived.funcId === 'lobby_state_update') {
      console.log("[Pong] Received lobby update:", payloadReceived.funcId, payloadReceived.payload)
      const lobbyData = payloadReceived.payload

      if (authResponse && lobbyData.players.some((p: any) => (p.userId === authResponse.user.id || p.id === authResponse.user.id))) {
        setLobby({
          lobbyId: lobbyData.lobbyId,
          gameMode: lobbyData.gameMode,
          players: lobbyData.players.map((p: any) => ({
            id: p.userId || p.id,
            username: p.username,
            isReady: p.isReady,
            isHost: p.isHost,
          })),
          settings: {
            ballCount: lobbyData.ballCount,
            maxScore: lobbyData.maxScore,
            allowPowerups: lobbyData.allowPowerups,
          },
          status: lobbyData.status,
        })

        // If we're not in lobby view, switch to it
        if (currentView === "menu") {
          setCurrentView("lobby")
        }
      }
    }

    // Handle game start from lobby - sent to all players
    if (payloadReceived.funcId === 'start_game_from_lobby') {
      console.log("[Pong] Received start_game_from_lobby! code:", payloadReceived.code, "payload:", payloadReceived.payload)
      if (payloadReceived.code === 0) {
        console.log("[Pong] Game started from lobby! Processing game state")
        const gameStatePayload = payloadReceived.payload

        // Preserve tournament ID before clearing lobby
        const tournamentIdToPreserve = activeTournamentId || tournament?.tournamentId || (lobby as any)?.tournament?.tournamentId || (lobby as any)?.tournamentId
        if (tournamentIdToPreserve) {
          console.log("[Pong] Preserving tournament ID:", tournamentIdToPreserve)
          setActiveTournamentId(tournamentIdToPreserve)
        }

        // Normalize and set up the game for all players
        console.log("[Pong] Setting game state and transitioning to game view")
        const normalized = normalizeGameState(gameStatePayload)
        setPlayerIDsHelper(normalized)
        setGameState(normalized)
        
        // ====================
        // CLIENT-SIDE PREDICTION: Initialize simulation for new game
        // ====================
        clientSimulationRef.current = new ClientPongSimulation()
        hasReceivedServerStateRef.current = false
        pressedKeysRef.current.clear()
        clientSimulationRef.current.initFromServerState(gameStatePayload, authResponse?.user?.id || -1)
        hasReceivedServerStateRef.current = true
        setDisplayState(normalized)
        
        setLobby(null) // Clear lobby state
        setCurrentView("game") // Transition immediately
      } else {
        console.warn("[Pong] start_game_from_lobby failed with code:", payloadReceived.code)
      }
    }
  }, [payloadReceived, authResponse, currentView, activeTournamentId])

  // Handle accepted invitation from AppRoot
  useEffect(() => {
    if (!acceptedLobbyId) return

    // Check if we have stored lobby data (from invitation via window)
    const storedLobbyData = (window as any).__acceptedLobbyData
    if (storedLobbyData && storedLobbyData.lobbyId === acceptedLobbyId) {
      console.log("[Pong] Setting up lobby from stored invitation data:", acceptedLobbyId)
      setLobby({
        lobbyId: storedLobbyData.lobbyId,
        gameMode: storedLobbyData.gameMode,
        players: storedLobbyData.players.map((p: any) => ({
          id: p.userId || p.id,
          username: p.username,
          isReady: p.isReady,
          isHost: p.isHost,
        })),
        settings: {
          ballCount: storedLobbyData.ballCount,
          maxScore: storedLobbyData.maxScore,
          allowPowerups: storedLobbyData.allowPowerups,
        },
        status: storedLobbyData.status,
      })

      // Capture tournament ID if this is a tournament lobby
      if (storedLobbyData.tournament?.tournamentId) {
        console.log("[Pong] Accepted tournament lobby, setting activeTournamentId:", storedLobbyData.tournament.tournamentId)
        setActiveTournamentId(storedLobbyData.tournament.tournamentId)
      }

      setCurrentView("lobby")
      if (onLobbyJoined) onLobbyJoined()
      // Clear after use
      delete (window as any).__acceptedLobbyData
    }
  }, [acceptedLobbyId, onLobbyJoined])

  const setPlayerIDsHelper = useCallback(
    (game_data: TypeGameStateSchema | null) => {
      if (!game_data) {
        console.log("[Pong] setPlayerIDsHelper: game_data is null");
        return;
      }
      if (!authResponse) {
        console.log("[Pong] setPlayerIDsHelper: authResponse is null");
        return;
      }
      let odd = true;
      for (const paddle of game_data.paddles) {
        if (paddle.owner_id === authResponse.user.id) {
          if (odd) {
            setPlayerOnePaddleID(paddle.paddle_id);
            odd = false;
          } else {
            setPlayerTwoPaddleID(paddle.paddle_id);
          }
        }
      }
    },
    [authResponse],
  )

  useEffect(() => {
    if (!payloadReceived) {
      return;
    }

    // Only log non-game-state messages to reduce spam
    if (payloadReceived.funcId !== 'get_game_state' && payloadReceived.source_container === 'pong') {
      console.log("[Pong] Processing:", payloadReceived.funcId);
    }

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
        console.warn("[Pong] Invalid payload", parsed.error);
        return;
      }

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
            // Update game state silently (happens frequently)
            const normalized = normalizeGameState(parsed.data)
            setGameState(normalized);
            gameStateReceivedRef.current = true;
            setPlayerIDsHelper(normalized);

            // ====================
            // CLIENT-SIDE PREDICTION: Initialize or Reconcile
            // ====================
            const simulation = clientSimulationRef.current
            if (!hasReceivedServerStateRef.current) {
              // First server state: initialize the simulation
              console.log("[Pong] Initializing client simulation from server state")
              simulation.initFromServerState(parsed.data, authResponse?.user?.id || -1)
              hasReceivedServerStateRef.current = true
              // Set display state immediately
              setDisplayState(normalized)
            } else {
              // Subsequent server states: reconcile with prediction
              simulation.reconcileWithServer(parsed.data, 0.3)
            }

          // If we received valid game state and we're not in game view, switch to it
          if (currentView !== 'game' && parsed.data?.board_id) {
            console.log("[Pong] Received game state while not in game view, transitioning to game");
            setLobby(null);
            setCurrentView("game");
          }
          break;
        case user_url.ws.pong.startGame.funcId:
          console.log("[Pong] Game started, received game info:", parsed.data);
          if (parsed.data && typeof parsed.data.board_id === 'number') {
            setLastCreatedBoardId(parsed.data.board_id)
          }
          // Game has been created, now request the game state once
          const requestGameStatePayload = {
            funcId: user_url.ws.pong.getGameState.funcId,
            payload: {
              gameId: parsed.data.board_id,
            },
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
  // Keyboard input - Single handler for all paddle controls
  // =========================
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Need game state and at least one paddle assigned
      if (gameState === null) return
      if (playerOnePaddleID === -1 && playerTwoPaddleID === -1) return
      if (pressedKeysRef.current.has(e.key.toLowerCase())) return
      
      pressedKeysRef.current.add(e.key.toLowerCase())

      if (gameState.board_id === null) return
      
      // ====================
      // CLIENT-SIDE PREDICTION: Apply input immediately to local simulation
      // ====================
      if (predictionEnabled) {
        clientSimulationRef.current.setPressedKeys(Array.from(pressedKeysRef.current))
      }
      
      // Send to server
      const payload: TypeHandleGameKeysSchema = {
        board_id: gameState.board_id,
        pressed_keys: Array.from(pressedKeysRef.current),
      }
      handleUserInput(user_url.ws.pong.handleGameKeys, payload)
    }

    function handleKeyUp(e: KeyboardEvent) {
      // Need game state and at least one paddle assigned
      if (gameState === null) return
      if (playerOnePaddleID === -1 && playerTwoPaddleID === -1) return
      
      pressedKeysRef.current.delete(e.key.toLowerCase())

      // ====================
      // CLIENT-SIDE PREDICTION: Apply input immediately to local simulation
      // ====================
      if (predictionEnabled) {
        clientSimulationRef.current.setPressedKeys(Array.from(pressedKeysRef.current))
      }

      // Send to server
      const payload = {
        board_id: gameState.board_id,
        pressed_keys: Array.from(pressedKeysRef.current),
      }
      handleUserInput(user_url.ws.pong.handleGameKeys, payload)
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [gameState, handleUserInput, playerOnePaddleID, playerTwoPaddleID, predictionEnabled])

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

  // Handler for creating a game from invite modal
  const handleCreateGame = useCallback(
    (mode: GameMode, selectedPlayers: number[], settings: GameSettings) => {
      console.log("[Pong] Creating game:", { mode, selectedPlayers, settings })

      // Create a lobby for this game
      const newLobby: PongLobbyData = {
        lobbyId: Date.now(), // Temporary ID until backend assigns one
        gameMode: mode,
        players: selectedPlayers.map((id) => ({
          id,
          username: inviteRoomUsers.find((u) => u.id === id)?.username || `User ${id}`,
          isReady: false,
          isHost: id === authResponse?.user?.id,
        })),
        settings: {
          ballCount: settings.ballCount,
          maxScore: settings.maxScore,
          allowPowerups: settings.allowPowerups,
        },
        status: "waiting",
      }

      setLobby(newLobby)

      // Send lobby creation to backend to notify all players
      // Create username map
      const playerUsernames: { [key: number]: string } = {}
      selectedPlayers.forEach(id => {
        const user = inviteRoomUsers.find((u) => u.id === id)
        playerUsernames[id] = user?.username || `User ${id}`
      })

      const payload = {
        funcId: "create_pong_lobby",
        payload: {
          gameMode: mode,
          playerIds: selectedPlayers,
          playerUsernames: playerUsernames,
          ballCount: settings.ballCount,
          maxScore: settings.maxScore,
          allowPowerups: settings.allowPowerups,
        },
        target_container: "pong",
      }

      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(JSON.stringify(payload))
        console.log("[Pong] Sent lobby creation to backend:", payload)
      }

      // If it's a tournament, also set up tournament data
      if (mode === "tournament_1v1" || mode === "tournament_multi") {
        const newTournament: TournamentData = {
          tournamentId: Date.now(),
          name: `${mode === "tournament_1v1" ? "1v1" : "Multiplayer"} Tournament`,
          mode: mode,
          players: selectedPlayers.map((id) => ({
            id,
            username: inviteRoomUsers.find((u) => u.id === id)?.username || `User ${id}`,
          })),
          matches: [], // Will be generated when all players enter aliases
          currentRound: 1,
          totalRounds: Math.ceil(Math.log2(selectedPlayers.length)),
          status: "registration",
          winner: null,
        }
        setTournament(newTournament)
        setCurrentView("tournament")
      } else {
        setCurrentView("lobby")
      }

      setShowInviteModalLocal(false)
      onCloseInviteModal?.()
    },
    [authResponse, inviteRoomUsers, onCloseInviteModal]
  )

  // Handler for toggling ready state in lobby
  const handleToggleReady = useCallback(() => {
    if (!lobby || !authResponse) return

    console.log("[Pong] Toggling ready state for lobby:", lobby.lobbyId)

    // Send toggle ready to backend
    const payload = {
      lobbyId: lobby.lobbyId,
    }

    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({
        funcId: "toggle_player_ready_in_lobby",
        payload: payload,
        target_container: "pong",
      }))
      console.log("[Pong] Sent toggle ready to backend")
    } else {
      console.warn("[Pong] WebSocket not open, cannot toggle ready")
    }
  }, [lobby, authResponse, socket])

  // Handler for starting game from lobby
  const handleStartGameFromLobby = useCallback(() => {
    if (!lobby || !authResponse) return

    console.log("[Pong] Starting game from lobby:", lobby.lobbyId)

    // Preserve tournament ID before anything else
    const tournamentId = tournament?.tournamentId || (lobby as any)?.tournament?.tournamentId || (lobby as any)?.tournamentId
    if (tournamentId) {
      console.log("[Pong] Preserving tournament ID for game start:", tournamentId)
      setActiveTournamentId(tournamentId)
    }

    // Send start game request to backend with lobby ID
    const payload = {
      lobbyId: lobby.lobbyId,
    }

    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({
        funcId: "start_game_from_lobby",
        payload: payload,
        target_container: "pong",
      }))
      console.log("[Pong] Sent start game from lobby to backend")
      setLobby({ ...lobby, status: "starting" })

      // Fallback: if we don't transition to game within 2 seconds, request game state
      // This handles cases where the WebSocket message doesn't trigger the effect for the host
      setTimeout(() => {
        console.log("[Pong] Fallback check: currentView after start request")
        // Request game state - if we're in a game, the response will trigger the transition
        if (socket.current?.readyState === WebSocket.OPEN) {
          socket.current.send(JSON.stringify({
            funcId: "get_game_state",
            payload: {
              gameId: 1,
            },
            target_container: "pong",
          }))
        }
      }, 1500)
    } else {
      console.warn("[Pong] WebSocket not open, cannot start game")
    }
  }, [lobby, authResponse, socket, tournament])

  // Handler for leaving lobby
  const handleLeaveLobby = useCallback(() => {
    if (lobby && socket.current?.readyState === WebSocket.OPEN) {
      console.log("[Pong] Leaving lobby:", lobby.lobbyId)
      socket.current.send(JSON.stringify({
        funcId: "leave_pong_lobby",
        payload: { lobbyId: lobby.lobbyId },
        target_container: "pong",
      }))
    }
    setLobby(null)
    setTournament(null)
    // Navigate back to chat page
    if (onNavigateToChat) {
      onNavigateToChat()
    } else {
      setCurrentView("menu")
    }
  }, [lobby, socket, onNavigateToChat])

  // Tournament handlers
  const handleEnterAlias = useCallback(
    (alias: string) => {
      if (!tournament || !authResponse) return

      setTournament({
        ...tournament,
        players: tournament.players.map((p) =>
          p.id === authResponse.user.id ? { ...p, alias } : p
        ),
      })
    },
    [tournament, authResponse]
  )

  const handleJoinTournamentMatch = useCallback(
    (matchId: number) => {
      console.log("[Pong] Joining tournament match:", matchId)
      // TODO: Send to backend to start this specific match
    },
    []
  )

  // Handle accepting pong invitation
  const handleAcceptInvitation = useCallback(
    (inviteId: number) => {
      console.log("[Pong] Accepting invitation:", inviteId)
      const invitation = pongInvitations.find((inv) => inv.inviteId === inviteId)
      if (!invitation) return

      // Remove invitation from list
      setPongInvitations((prev) => prev.filter((inv) => inv.inviteId !== inviteId))

      // Switch to lobby view - apply lobby data from the invitation so invitee sees the lobby
      if (invitation.lobbyData) {
        const lobbyData = invitation.lobbyData as any
        const lobbyState: PongLobbyData = {
          lobbyId: lobbyData.lobbyId || Date.now(),
          gameMode: lobbyData.gameMode,
          players: (lobbyData.players || []).map((p: any) => ({
            id: p.userId || p.id,
            username: p.username,
            isReady: p.isReady || false,
            isHost: p.isHost || false,
          })),
          settings: {
            ballCount: lobbyData.ballCount,
            maxScore: lobbyData.maxScore,
            allowPowerups: lobbyData.allowPowerups,
          },
          status: lobbyData.status || "waiting",
        }
        setLobby(lobbyState)

        // If the invite contains a tournament payload, set tournament state and go to tournament view
        if (lobbyData.tournament) {
          const t = lobbyData.tournament
          const newTournament: TournamentData = {
            tournamentId: t.tournamentId,
            name: t.name,
            mode: t.mode,
            players: (t.players || []).map((p: any) => ({ id: p.userId, username: p.username, alias: p.alias })),
            matches: t.matches || [],
            currentRound: t.currentRound,
            totalRounds: t.totalRounds,
            status: t.status,
            winner: t.winnerId || null,
          }
          setTournament(newTournament)
          setCurrentView("tournament")
          return
        }

        setCurrentView("lobby")
        return
      }

      // Fallback: just switch to lobby view
      setCurrentView("lobby")
    },
    [pongInvitations]
  )

  // Handle declining pong invitation
  const handleDeclineInvitation = useCallback(
    (inviteId: number) => {
      console.log("[Pong] Declining invitation:", inviteId)
      // Just remove from list - backend will handle timeout
      setPongInvitations((prev) => prev.filter((inv) => inv.inviteId !== inviteId))
    },
    []
  )

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-gray-100/80 dark:bg-dark-600 p-4 space-y-4">
      {/* Pong Invitation Notifications now rendered globally in AppRoot */}

      {/* Main Menu */}
      {currentView === "menu" && (
        <div className="w-full max-w-2xl space-y-4">
          <div className="glass-light-sm dark:glass-dark-sm glass-border shadow-lg p-8 text-center">
            <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-200 mb-4">🏓 Pong</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Play classic Pong against other players in various game modes
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setShowInviteModalLocal(true)}
                className="w-full py-3 bg-blue-500 text-white hover:bg-blue-600 transition-colors font-semibold"
              >
                🎮 Create Game
              </button>
              <button
                onClick={() => {
                  // Quick solo play for testing
                  if (authResponse) {
                    const payload: TypeStartNewPongGame = {
                      player_list: [authResponse.user.id],
                      balls: 1,
                    }
                    handleUserInput(user_url.ws.pong.startGame, payload)
                    setCurrentView("game")
                  }
                }}
                className="w-full py-3 bg-green-500 text-white hover:bg-green-600 transition-colors font-semibold"
              >
                🤖 Quick Play (Solo)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lobby View */}
      {currentView === "lobby" && lobby && authResponse && (
        <div className="w-full max-w-2xl">
          <PongLobby
            lobby={lobby}
            currentUserId={authResponse.user.id}
            onToggleReady={handleToggleReady}
            onStartGame={handleStartGameFromLobby}
            onLeaveLobby={handleLeaveLobby}
          />
          {/* If this lobby is associated with a tournament (or we have tournament state), allow viewing stats */}
          {(tournament || (lobby as any).tournamentId) && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowTournamentStats(true)}
                className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
              >
                View Tournament Stats
              </button>
            </div>
          )}

          {showTournamentStats && (tournament ? (
            <TournamentStats
              tournamentId={tournament.tournamentId}
              onClose={() => setShowTournamentStats(false)}
            />
          ) : activeTournamentId ? (
            <TournamentStats
              tournamentId={activeTournamentId}
              onClose={() => setShowTournamentStats(false)}
            />
          ) : (lobby as any)?.tournamentId ? (
            <TournamentStats
              tournamentId={(lobby as any).tournamentId}
              onClose={() => setShowTournamentStats(false)}
            />
          ) : null)}
        </div>
      )}

      {/* Tournament View */}
      {currentView === "tournament" && tournament && authResponse && (
        <div className="w-full max-w-6xl overflow-x-auto">
          <TournamentBracket
            tournament={tournament}
            currentUserId={authResponse.user.id}
            onEnterAlias={handleEnterAlias}
            onJoinMatch={handleJoinTournamentMatch}
          />
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setShowTournamentStats(true)}
              className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
            >
              View Tournament Stats
            </button>
          </div>
          {showTournamentStats && (
            <TournamentStats
              tournamentId={tournament.tournamentId}
              onClose={() => setShowTournamentStats(false)}
            />
          )}
          <button
            onClick={handleLeaveLobby}
            className="mt-4 px-6 py-2 bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            Leave Tournament
          </button>
        </div>
      )}

      {/* Game View */}
      {currentView === "game" && (
        <>
          <div className="w-full flex-1 min-h-[500px] shadow-lg border border-gray-800 bg-black overflow-hidden relative">
            {/* 
              CLIENT-SIDE PREDICTION: Use displayState (locally predicted) for smooth visuals
              Falls back to gameState if displayState is not yet available
            */}
            <BabylonPongRenderer 
              ref={rendererRef} 
              gameState={displayState || gameState} 
              darkMode={darkMode} 
              paddleRotationOffset={paddleRotationOffset} 
            />
            <div style={{ position: 'absolute', right: 8, top: 8, zIndex: 40 }}>
              <div className="flex flex-col space-y-2">
                <div className="flex space-x-2">
                  {/* Prediction Toggle */}
                  <button
                    onClick={() => setPredictionEnabled(!predictionEnabled)}
                    className={`px-2 py-1 text-sm font-medium rounded ${predictionEnabled ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}
                    title={predictionEnabled ? "Client-side prediction ON (smooth)" : "Client-side prediction OFF (server only)"}
                  >
                    {predictionEnabled ? '🎯 Prediction ON' : '📡 Server Only'}
                  </button>
                </div>
                <div className="flex space-x-2">
                <button
                  onClick={() => setPaddleRotationOffset(0)}
                  className={`px-2 py-1 text-sm font-medium rounded ${paddleRotationOffset === 0 ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                >
                  Offset 0
                </button>
                <button
                  onClick={() => setPaddleRotationOffset(Math.PI / 2)}
                  className={`px-2 py-1 text-sm font-medium rounded ${Math.abs(paddleRotationOffset - Math.PI/2) < 0.001 ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                >
                  Offset 90°
                </button>
                <button
                  onClick={() => {
                    try {
                      const data = rendererRef.current?.takeScreenshot?.()
                      if (data) {
                        const w = window.open()
                        if (w) w.document.write(`<img src="${data}" style="max-width:100%"/>`)
                      } else {
                        console.warn('[Pong] Screenshot not available')
                      }
                    } catch (e) {
                      console.warn('[Pong] Screenshot failed', e)
                    }
                  }}
                  className="px-2 py-1 text-sm font-medium rounded bg-green-500 text-white"
                >
                  Screenshot
                </button>
                </div>
              </div>
            </div>
          </div>

          {!gameState && (
            <div className="text-sm text-gray-600 dark:text-gray-300">Waiting for game state...</div>
          )}

          <button
            onClick={() => {
              // Leave lobby if we're in one
              if (lobby && socket.current?.readyState === WebSocket.OPEN) {
                console.log("[Pong] Leaving lobby from game:", lobby.lobbyId)
                socket.current.send(JSON.stringify({
                  funcId: "leave_pong_lobby",
                  payload: { lobbyId: lobby.lobbyId },
                  target_container: "pong",
                }))
              }
              // Reset client simulation state
              clientSimulationRef.current = new ClientPongSimulation()
              hasReceivedServerStateRef.current = false
              pressedKeysRef.current.clear()
              setDisplayState(null)
              
              setCurrentView("menu")
              setGameState(null)
              setLobby(null)
            }}
            className="px-6 py-2 bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            Leave Game
          </button>
        </>
      )}

      {/* Invite Modal */}
      <PongInviteModal
        isOpen={showInviteModal || showInviteModalLocal}
        onClose={() => {
          setShowInviteModalLocal(false)
          onCloseInviteModal?.()
        }}
        roomUsers={inviteRoomUsers}
        currentUserId={authResponse?.user?.id || 0}
        onCreateGame={handleCreateGame}
      />

      {/* Debug overlay - only show in game view */}
      {currentView === "game" && (
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
          {/* DEBUG: Complete Tournament - calls server endpoint to finish tournament */}
          {(tournament || activeTournamentId || (lobby as any)?.tournamentId) && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={async () => {
                  const tid = tournament?.tournamentId || activeTournamentId || (lobby as any)?.tournamentId
                  const winnerId = authResponse?.user?.id || 0
                  console.log("[Pong][DEBUG] Completing tournament", tid, "winner:", winnerId)
                  try {
                    const res = await fetch("/public_api/pong/debug/complete_tournament", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ tournamentId: tid, winnerId })
                    })
                    const data = await res.json()
                    console.log("[Pong][DEBUG] Tournament completed:", data)
                    if (data.tournament) {
                      setTournament(data.tournament)
                      setActiveTournamentId(null) // Clear after completion
                      alert(`Tournament completed! Winner: ${data.tournament.winnerId}\nOn-chain TX: ${data.tournament.onchainTxHashes?.join(", ") || "none"}`)
                    } else {
                      alert("Error: " + (data.message || JSON.stringify(data)))
                    }
                  } catch (e) {
                    console.error("[Pong][DEBUG] Failed to complete tournament:", e)
                    alert("Failed to complete tournament: " + e)
                  }
                }}
                style={{ backgroundColor: "#dc2626", color: "white", padding: "8px 12px", borderRadius: 8 }}
              >
                🏆 DEBUG: Complete Tournament
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
