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
import PongInviteModal, { type GameMode, type GameSettings } from "./pongInviteModal"
import PongLobby, { type PongLobbyData, type LobbyPlayer } from "./pongLobby"
import TournamentBracket, { type TournamentData, type TournamentMatch } from "./tournamentBracket"
import PongInviteNotifications, { type PongInvitation } from "./pongInviteNotifications"

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
  const { socket, payloadReceived } = useWebSocket()
  const [latestPlayerReadyPayload, setLatestPlayerReadyPayload] = useState<TypePlayerReadyForGameSchema | null>(null)
  const [gameSelectedInput, setGameSelectedInput] = useState<number>(1)
  const [gameState, setGameState] = useState<TypeGameStateSchema | null>(null)
  const [playerOnePaddleID, setPlayerOnePaddleID] = useState<number>(-1)
  const [playerTwoPaddleID, setPlayerTwoPaddleID] = useState<number>(-2)
  const gameStateReceivedRef = useRef<boolean>(false)
  const retryIntervalRef = useRef<number | null>(null)
  const [lastCreatedBoardId, setLastCreatedBoardId] = useState<number | null>(null)

  // New state for lobby and tournament
  const [currentView, setCurrentView] = useState<"menu" | "lobby" | "game" | "tournament">("menu")
  const [lobby, setLobby] = useState<PongLobbyData | null>(null)
  const [tournament, setTournament] = useState<TournamentData | null>(null)
  const [showInviteModalLocal, setShowInviteModalLocal] = useState(false)
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
    if (payloadReceived.funcId === 'create_pong_lobby' || payloadReceived.funcId === 'pong_lobby_invitation' || payloadReceived.funcId === 'lobby_state_update') {
      console.log("[Pong] DEBUG: Received message:", JSON.stringify(payloadReceived))
    }
    
    if (payloadReceived.source_container !== 'pong') {
      if (payloadReceived.funcId === 'create_pong_lobby') {
        console.log("[Pong] DEBUG: create_pong_lobby filtered out! source_container:", payloadReceived.source_container)
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
    if (payloadReceived.funcId === 'start_game_from_lobby' && payloadReceived.code === 0) {
      console.log("[Pong] Game started from lobby! Received game state:", payloadReceived.payload)
      const gameState = payloadReceived.payload
      
      // Set up the game for all players
      setPlayerIDsHelper(gameState)
      setGameState(gameState)
      setCurrentView("game")
      setLobby(null) // Clear lobby state
      console.log("[Pong] Transitioned to game view")
    }
  }, [payloadReceived, authResponse, currentView])

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
      setCurrentView("lobby")
      if (onLobbyJoined) onLobbyJoined()
      // Clear after use
      delete (window as any).__acceptedLobbyData
    }
  }, [acceptedLobbyId, onLobbyJoined])

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
    } else {
      console.warn("[Pong] WebSocket not open, cannot start game")
    }
  }, [lobby, authResponse, socket])

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
      
      // Switch to lobby view - the lobby data is already received from create_lobby message
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
    <div className="flex flex-col items-center justify-center w-full h-full bg-gray-50 dark:bg-dark-600 p-4 space-y-4">
      {/* Pong Invitation Notifications now rendered globally in AppRoot */}

      {/* Main Menu */}
      {currentView === "menu" && (
        <div className="w-full max-w-2xl space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center">
            <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-200 mb-4">🏓 Pong</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Play classic Pong against other players in various game modes
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setShowInviteModalLocal(true)}
                className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold"
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
                className="w-full py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-semibold"
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
          <button
            onClick={handleLeaveLobby}
            className="mt-4 px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Leave Tournament
          </button>
        </div>
      )}

      {/* Game View */}
      {currentView === "game" && (
        <>
          <div className="w-full flex-1 min-h-[500px] rounded-2xl shadow-lg border border-gray-800 bg-black overflow-hidden">
            <BabylonPongRenderer gameState={gameState} darkMode={darkMode} />
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
              setCurrentView("menu")
              setGameState(null)
              setLobby(null)
            }}
            className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
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
        </div>
      )}
    </div>
  )
}
