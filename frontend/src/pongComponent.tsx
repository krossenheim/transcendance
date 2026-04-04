"use client"

import { useCallback, useEffect, useState, useRef } from "react"

import type {
  TypeHandleGameKeysSchema,
  TypeGameStateSchema,
} from "./types/pong-interfaces"
import { useWebSocket, HandlerResult } from "./socketComponent"
import { user_url } from "@app/shared/api/service/common/endpoints"
import type { AuthResponseType } from "./types/auth-response"
import BabylonPongRenderer from "./BabylonPongRenderer"
import PowerupDisplay from "./PowerupDisplay"
import PongLeaderboard from "./PongLeaderboard"
import PongInviteModal, { type GameMode, type GameSettings } from "./pongInviteModal"
import PongLobby, { type PongLobbyData } from "./pongLobby"
import TournamentBracket, { type TournamentData, type TournamentMatch } from "./tournamentBracket"
import TournamentStats from "./tournamentStats"
import { type PongInvitation } from "./pongInviteNotifications"
import { usePredictedGameState } from "./usePredictedGameState"
import { useLanguage } from "./i18n/LanguageContext"
import { usePongStore } from "./stores/pongStore"
import { setGamePlayerIds } from "@utils/users"
// local: avoid importing server-side db helpers

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
  // Cache for delta compression: stores static state (walls, gameOptions) per game
  // Keyed by board_id to support multiple simultaneous games (e.g., tournament mini-previews)
  const cachedStaticStatesRef = useRef<Map<number, {
    walls: any[];
    gameOptions: any;
    seed: number;
    allPlayers: number[];
  }>>(new Map());

  // Helper: normalize server GameState (tuples) to frontend-friendly objects
  // Supports delta compression: merges delta updates with cached static state
  const normalizeGameState = (raw: any) => {
    if (!raw) return null

    // Check if this is a delta update (missing walls = delta)
    const isDelta = raw.isDelta === true;
    const incomingBoardId = raw.board_id ?? raw.boardId;
    
    // Get cached static state for this specific game
    const cachedStatic = incomingBoardId != null ? cachedStaticStatesRef.current.get(incomingBoardId) : undefined;
    
    // If delta update, merge with cached static state
    let wallsSource = raw.walls;
    let metadataSource = raw.metadata;
    
    if (isDelta && cachedStatic) {
      // Use cached walls for delta updates
      wallsSource = cachedStatic.walls;
      // Merge metadata: delta metadata + cached static fields
      metadataSource = {
        ...raw.metadata,
        gameOptions: cachedStatic.gameOptions,
        seed: cachedStatic.seed,
        allPlayers: raw.metadata?.allPlayers ?? cachedStatic.allPlayers,
        id: incomingBoardId,
      };
    } else if (!isDelta && raw.walls && incomingBoardId != null) {
      // Full update: cache static state for this game
      cachedStaticStatesRef.current.set(incomingBoardId, {
        walls: raw.walls,
        gameOptions: raw.metadata?.gameOptions,
        seed: raw.metadata?.seed,
        allPlayers: raw.metadata?.allPlayers,
      });
      
      // Cleanup: limit cache size to prevent memory leaks (keep last 10 games)
      if (cachedStaticStatesRef.current.size > 10) {
        const firstKey = cachedStaticStatesRef.current.keys().next().value;
        if (firstKey !== undefined) {
          cachedStaticStatesRef.current.delete(firstKey);
        }
      }
    }

    // balls: tuple [x,y,dx,dy,radius,inverse_mass] -> { id, x, y, dx, dy }
    const balls = (raw.balls || []).filter((b: any) => b != null).map((b: any, idx: number) => {
      if (Array.isArray(b)) {
        // New backend includes stable ball id at index 6. Fallback to index if missing.
        const stableId = Number.isFinite(Number(b[6])) ? Number(b[6]) : idx
        return {
          id: stableId,
          x: Number(b[0]) || 0,
          y: Number(b[1]) || 0,
          dx: Number(b[2]) || 0,
          dy: Number(b[3]) || 0,
          radius: Number(b[4]) || 10,
        }
      }
      // already object-shaped (defensive access)
      return {
        id: b?.id ?? idx,
        x: b?.x ?? 0,
        y: b?.y ?? 0,
        dx: b?.dx ?? 0,
        dy: b?.dy ?? 0,
        radius: b?.radius ?? b?.r ?? 10,
      }
    })

    // paddles: tuple [x,y,angle,width,height,vx,vy,playerId] -> { x,y,r,w,l,owner_id,paddle_id }
    const paddles = (raw.paddles || []).filter((p: any) => p != null).map((p: any, idx: number) => {
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
        x: p?.x ?? 0,
        y: p?.y ?? 0,
        r: p?.r ?? p?.rotation ?? 0,
        w: p?.w ?? p?.width ?? 10,
        l: p?.l ?? p?.length ?? 50,
        owner_id: p?.owner_id ?? p?.ownerId ?? p?.player_id ?? p?.playerId ?? idx,
        paddle_id: p?.paddle_id ?? p?.id ?? idx,
      }
    })

    // walls: tuple [ax,ay,bx,by,...] -> edges as polygon points using pointA of each wall
    const edges = (wallsSource || []).filter((w: any) => w != null).map((w: any) => {
      if (Array.isArray(w)) {
        // w[6] is playerId (null for regular walls, number for eliminated player's goal)
        return { x: Number(w[0]) || 0, y: Number(w[1]) || 0, playerId: w[6] ?? null }
      }
      return { x: w?.x ?? 0, y: w?.y ?? 0, playerId: w?.playerId ?? null }
    })

    return {
      board_id: raw.board_id ?? raw.boardId ?? null,
      edges,
      paddles,
      balls,
      metadata: metadataSource ?? null,
      powerups: raw.powerups ?? raw.power_up ?? [],
      activeEffects: raw.activeEffects ?? [],
      recentEvents: raw.recentEvents ?? [],
      score: raw.score ?? null,
      gameOver: raw.gameOver ?? false,
      winner: raw.winner ?? null,
    }
  }
  const { isConnected, sendMessage, subscribe } = useWebSocket()
  
  // Get state from Zustand store
  const gameState = usePongStore((state) => state.gameState)
  const setGameState = usePongStore((state) => state.setGameState)
  const playerOnePaddleID = usePongStore((state) => state.playerOnePaddleID)
  const setPlayerOnePaddleID = usePongStore((state) => state.setPlayerOnePaddleID)
  const playerTwoPaddleID = usePongStore((state) => state.playerTwoPaddleID)
  const setPlayerTwoPaddleID = usePongStore((state) => state.setPlayerTwoPaddleID)
  const lastCreatedBoardId = usePongStore((state) => state.lastCreatedBoardId)
  const setLastCreatedBoardId = usePongStore((state) => state.setLastCreatedBoardId)
  const pressedKeys = usePongStore((state) => state.pressedKeys)
  const setPressedKeys = usePongStore((state) => state.setPressedKeys)
  const currentView = usePongStore((state) => state.currentView)
  const setCurrentView = usePongStore((state) => state.setCurrentView)
  const lobby = usePongStore((state) => state.lobby)
  const setLobby = usePongStore((state) => state.setLobby)
  const tournament = usePongStore((state) => state.tournament)
  const setTournament = usePongStore((state) => state.setTournament)
  const activeTournamentId = usePongStore((state) => state.activeTournamentId)
  const setActiveTournamentId = usePongStore((state) => state.setActiveTournamentId)
  const showInviteModalLocal = usePongStore((state) => state.showInviteModalLocal)
  const setShowInviteModalLocal = usePongStore((state) => state.setShowInviteModalLocal)
  const showTournamentStats = usePongStore((state) => state.showTournamentStats)
  const setShowTournamentStats = usePongStore((state) => state.setShowTournamentStats)
  const tournamentMatchResult = usePongStore((state) => state.tournamentMatchResult)
  const setTournamentMatchResult = usePongStore((state) => state.setTournamentMatchResult)
  const debugPlayers = usePongStore((state) => state.debugPlayers)
  const setDebugPlayers = usePongStore((state) => state.setDebugPlayers)
  const resetGameState = usePongStore((state) => state.resetGameState)
  
  const gameStateRef = useRef(gameState)
  gameStateRef.current = gameState
  const gameStateReceivedRef = useRef<boolean>(false)
  const retryIntervalRef = useRef<number | null>(null)

  // Watched game states for mini-previews in tournament bracket (keyed by gameId/board_id)
  const watchedGameStatesRef = useRef<Record<number, TypeGameStateSchema>>({})
  // Set of gameIds we are currently watching (for routing getGameState updates)
  const watchedGameIdsRef = useRef<Set<number>>(new Set())
  // Force bracket re-render counter (throttled)
  const [watchedStatesVersion, setWatchedStatesVersion] = useState(0)
  const watchedThrottleRef = useRef<number>(0)
  // Renderer controls for tuning paddle rotation and screenshots
  const rendererRef = useRef<any>(null)
  const [paddleRotationOffset] = useState<number>(0)
  
  // Get user ID for prediction
  const myUserId = authResponse?.user?.id ?? -1
  
  // Use client-side prediction for smooth rendering
  const predictedGameState = usePredictedGameState(gameState, myUserId, pressedKeys)
  
  // Debug: Log all view changes (disabled for performance)
  // useEffect(() => {
  //   console.log("[Pong] VIEW IS NOW:", currentView);
  // }, [currentView]);
  
  // pongInvitations and setPongInvitations are now passed as props from AppRoot

  // Reset view when in stale game view (no game state) - navigate back to chat
  useEffect(() => {
    if (currentView === "game" && !gameState) {
      console.log("[Pong] Resetting stale game view (no gameState), navigating to chat")
      setCurrentView("menu")
      if (onNavigateToChat) onNavigateToChat()
    }
  }, [currentView, gameState, setCurrentView, onNavigateToChat])

  // No longer auto-redirect from menu to chat — users can browse the pong menu directly

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

  // Ref for onNavigateToChat to use in event handlers
  const onNavigateToChatRef = useRef(onNavigateToChat)
  useEffect(() => {
    onNavigateToChatRef.current = onNavigateToChat
  }, [onNavigateToChat])

  useEffect(() => {
    // Only run cleanup on actual unmount
    return () => {
      if (lobbyRef.current) {
        console.log("[Pong] Component unmounting, leaving lobby:", lobbyRef.current.lobbyId)
        sendMessage(user_url.ws.pong.leaveLobby, { lobbyId: lobbyRef.current.lobbyId })
      }
    }
  }, [sendMessage])

  // =========================
  // Fetch game state on mount
  // =========================
  useEffect(() => {
    if (!isConnected) {
      console.log("[Pong] Socket not ready yet");
      return;
    }

    // Only request game state if socket is ready
    console.log("[Pong] Requesting game state...");
    console.log("[Pong] getGameState config:", {
      funcId: user_url.ws.pong.getGameState.funcId,
      container: user_url.ws.pong.getGameState.container,
    });
    console.log("[Pong] Sending payload for gameId:", lastCreatedBoardId);
    if (lastCreatedBoardId != null) {
      sendMessage(user_url.ws.pong.getGameState, { gameId: lastCreatedBoardId });
    }
    console.log("[Pong] Game state request sent");
  }, [isConnected, lastCreatedBoardId, sendMessage]);

  // =========================
  // Resync lobby state after reconnect
  // =========================
  const wasConnected = useRef(false)
  useEffect(() => {
    if (isConnected && !wasConnected.current && currentViewRef.current === "lobby") {
      console.log("[Pong] Reconnected while in lobby, requesting lobby state resync");
      sendMessage(user_url.ws.pong.getLobbyState, {});
    }
    wasConnected.current = isConnected;
  }, [isConnected, sendMessage]);

  // =========================
  // Subscribe to pong WebSocket events
  // =========================
  
  // Helper function for setting player paddle IDs
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
      console.log("[Pong] setPlayerIDsHelper: Looking for user ID", authResponse.user.id, "in paddles:", game_data.paddles.map(p => p.owner_id));
      let foundPaddle = false;
      let odd = true;
      for (const paddle of game_data.paddles) {
        if (paddle.owner_id === authResponse.user.id) {
          foundPaddle = true;
          if (odd) {
            console.log("[Pong] setPlayerIDsHelper: Setting playerOnePaddleID to", paddle.paddle_id);
            setPlayerOnePaddleID(paddle.paddle_id);
            odd = false;
          } else {
            console.log("[Pong] setPlayerIDsHelper: Setting playerTwoPaddleID to", paddle.paddle_id);
            setPlayerTwoPaddleID(paddle.paddle_id);
          }
        }
      }
      if (!foundPaddle) {
        console.warn("[Pong] setPlayerIDsHelper: NO PADDLE FOUND for user ID", authResponse.user.id);
      }
    },
    [authResponse, setPlayerOnePaddleID, setPlayerTwoPaddleID],
  )

  // Ref for tournament to use in stable subscriptions
  const tournamentRef = useRef(tournament)
  useEffect(() => {
    tournamentRef.current = tournament
  }, [tournament])

  // Ref for authResponse to use in stable subscriptions
  const authResponseRef = useRef(authResponse)
  useEffect(() => {
    authResponseRef.current = authResponse
  }, [authResponse])

  // Ref for currentView to use in stable subscriptions
  const currentViewRef = useRef(currentView)
  useEffect(() => {
    currentViewRef.current = currentView
  }, [currentView])

  // Ref for activeTournamentId to use in stable subscriptions
  const activeTournamentIdRef = useRef(activeTournamentId)
  useEffect(() => {
    activeTournamentIdRef.current = activeTournamentId
  }, [activeTournamentId])

  // Set stable tournament-wide player colors so bracket doesn't flicker
  useEffect(() => {
    if (tournament?.players && tournament.players.length > 0) {
      setGamePlayerIds(tournament.players.map(p => p.id));
    }
  }, [tournament?.players])

  // BULLETPROOF ref: stores tournament info from the moment the game starts.
  // Cannot be cleared by Zustand state changes or React re-renders.
  // Only cleared explicitly on "Back to Menu".
  const tournamentGameRef = useRef<{ tournamentId: number } | null>(null)

  // Auto-restore activeTournamentId from ALL available sources
  useEffect(() => {
    const fallbackId = tournament?.tournamentId
      || tournamentMatchResult?.tournamentId
      || (gameState?.metadata as any)?.tournamentId
      || tournamentGameRef.current?.tournamentId;
    if (fallbackId && !activeTournamentId) {
      console.warn("[Pong] activeTournamentId was null but tournament data exists — auto-restoring:", fallbackId);
      setActiveTournamentId(fallbackId);
    }
  }, [tournament, tournamentMatchResult, gameState, activeTournamentId, setActiveTournamentId])

  // STABLE subscription for getLobbyState (resync lobby after reconnect)
  useEffect(() => {
    if (!subscribe) return;

    const unsubscribe = subscribe(user_url.ws.pong.getLobbyState, (message, schema) => {
      console.log("[Pong-Stable] Received getLobbyState:", message.code);

      if (message.code === schema.output.LobbyFound.code) {
        const lobbyData = message.payload;
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
            ballCount: lobbyData.ballCount ?? 1,
            maxScore: lobbyData.maxScore ?? 5,
            allowPowerups: lobbyData.allowPowerups ?? false,
            aiCount: lobbyData.aiCount ?? 0,
          },
          status: lobbyData.status,
        });
        console.log("[Pong-Stable] Lobby state resynced after reconnect");
        return HandlerResult.Handled;
      }

      if (message.code === schema.output.NotInLobby.code) {
        console.log("[Pong-Stable] Server says not in lobby, clearing local lobby state");
        setLobby(null);
        setCurrentView("menu");
        return HandlerResult.Handled;
      }

      return HandlerResult.NotHandled;
    });

    return () => unsubscribe();
  }, [subscribe, setLobby, setCurrentView]);

  // STABLE subscription for declineLobbyInvitation (host receives updated lobby when someone declines)
  useEffect(() => {
    if (!subscribe) return;

    const unsubscribe = subscribe(user_url.ws.pong.declineLobbyInvitation, (message, schema) => {
      console.log("[Pong-Stable] Received declineLobbyInvitation:", message.code);

      if (message.code === schema.output.LobbyUpdate.code) {
        const lobbyData = message.payload;
        const currentAuth = authResponseRef.current;
        if (currentAuth && lobbyData.players.some((p: any) =>
          p.userId === currentAuth.user.id || p.id === currentAuth.user.id
        )) {
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
              ballCount: lobbyData.ballCount ?? 1,
              maxScore: lobbyData.maxScore ?? 5,
              allowPowerups: lobbyData.allowPowerups ?? false,
              aiCount: lobbyData.aiCount ?? 0,
            },
            status: lobbyData.status,
          });
        }
        return HandlerResult.Handled;
      }

      if (message.code === schema.output.Declined.code) {
        return HandlerResult.Handled;
      }

      return HandlerResult.NotHandled;
    });

    return () => unsubscribe();
  }, [subscribe, setLobby]);

  // STABLE subscription for togglePlayerReady (separate from main effect to avoid missing messages during resubscription)
  useEffect(() => {
    if (!subscribe) return;
    
    const unsubscribe = subscribe(user_url.ws.pong.togglePlayerReady, (message, schema) => {
      console.log("[Pong-Stable] Received togglePlayerReady:", message.code);
      
      if (message.code === schema.output.LobbyUpdate.code) {
        const lobbyData = message.payload;
        const currentAuth = authResponseRef.current;
        if (currentAuth && lobbyData.players.some((p: any) => 
          p.userId === currentAuth.user.id || p.id === currentAuth.user.id
        )) {
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
              ballCount: lobbyData.ballCount ?? 1,
              maxScore: lobbyData.maxScore ?? 5,
              allowPowerups: lobbyData.allowPowerups ?? false,
              aiCount: lobbyData.aiCount ?? 0,
            },
            status: lobbyData.status,
          });
          
          if (currentViewRef.current === "menu") {
            setCurrentView("lobby");
          }
        }
        return HandlerResult.Handled;
      }
      
      return HandlerResult.NotHandled;
    });
    
    return () => unsubscribe();
  }, [subscribe, setLobby, setCurrentView]);

  // STABLE subscription for leaveLobby — remaining players receive LobbyUpdate when someone leaves
  useEffect(() => {
    if (!subscribe) return;

    const unsubscribe = subscribe(user_url.ws.pong.leaveLobby, (message, schema) => {
      console.log("[Pong-Stable] Received leaveLobby:", message.code);

      if (message.code === schema.output.LobbyUpdate.code) {
        const lobbyData = message.payload;
        const currentAuth = authResponseRef.current;
        if (currentAuth && lobbyData.players.some((p: any) =>
          p.userId === currentAuth.user.id || p.id === currentAuth.user.id
        )) {
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
              ballCount: lobbyData.ballCount ?? 1,
              maxScore: lobbyData.maxScore ?? 5,
              allowPowerups: lobbyData.allowPowerups ?? false,
              aiCount: lobbyData.aiCount ?? 0,
            },
            status: lobbyData.status,
          });
        }
        return HandlerResult.Handled;
      }

      return HandlerResult.NotHandled;
    });

    return () => unsubscribe();
  }, [subscribe, setLobby]);

  // STABLE subscription for createLobby (separate from main effect to avoid missing LobbyCreated during subscription churn)
  useEffect(() => {
    if (!subscribe) return;

    const unsubscribe = subscribe(user_url.ws.pong.createLobby, (message, schema) => {
      console.log("[Pong-Stable] Received createLobby:", message.code, message.payload);

      if (message.code === schema.output.LobbyCreated.code) {
        const currentAuth = authResponseRef.current;
        // Check if we're the host
        const isHost = currentAuth && message.payload.players?.some((p: any) =>
          (p.userId === currentAuth.user.id || p.id === currentAuth.user.id) && p.isHost
        );

        console.log("[Pong-Stable] isHost check: myId=", currentAuth?.user?.id, "isHost=", isHost);

        if (isHost) {
          // Update lobby with the real backend-assigned lobbyId
          setLobby({
            lobbyId: message.payload.lobbyId,
            gameMode: message.payload.gameMode,
            players: message.payload.players.map((p: any) => ({
              id: p.userId || p.id,
              username: p.username,
              isReady: p.isReady,
              isHost: p.isHost,
            })),
            settings: {
              ballCount: message.payload.ballCount ?? 1,
              maxScore: message.payload.maxScore ?? 5,
              allowPowerups: message.payload.allowPowerups ?? false,
              aiCount: message.payload.aiCount ?? 0,
            },
            status: message.payload.status,
          });

          // If this is a tournament lobby, capture the SERVER's tournament ID
          if (message.payload.tournament?.tournamentId) {
            const serverTournament = message.payload.tournament;
            console.log("[Pong-Stable] Tournament lobby created, setting activeTournamentId:", serverTournament.tournamentId);
            setActiveTournamentId(serverTournament.tournamentId);
            // Store in bulletproof ref AND window
            tournamentGameRef.current = { tournamentId: serverTournament.tournamentId };
            (window as any).__pongTournamentId = serverTournament.tournamentId;
            console.log("[Pong-Stable] 🏆 Stored tournament ID in ref + window:", serverTournament.tournamentId);

            setTournament({
              tournamentId: serverTournament.tournamentId,
              name: serverTournament.name || "Tournament",
              mode: serverTournament.mode || message.payload.gameMode,
              players: serverTournament.players?.map((p: any) => ({
                id: p.userId || p.id,
                username: p.username || `Player ${p.userId || p.id}`,
                alias: p.alias,
              })) || [],
              matches: serverTournament.matches?.map((m: any) => ({
                matchId: m.matchId,
                round: m.round,
                player1: serverTournament.players?.find((p: any) => (p.userId || p.id) === m.player1Id) ?
                  { id: m.player1Id, username: serverTournament.players?.find((p: any) => (p.userId || p.id) === m.player1Id)?.username || `Player ${m.player1Id}` } : null,
                player2: serverTournament.players?.find((p: any) => (p.userId || p.id) === m.player2Id) ?
                  { id: m.player2Id, username: serverTournament.players?.find((p: any) => (p.userId || p.id) === m.player2Id)?.username || `Player ${m.player2Id}` } : null,
                winner: m.winnerId,
                status: m.status,
                readyPlayers: m.readyPlayers || [],
                gameId: m.gameId ?? undefined,
              })) || [],
              currentRound: serverTournament.currentRound || 1,
              totalRounds: serverTournament.totalRounds || 2,
              status: serverTournament.status === "completed" ? "completed" : "in_progress" as const,
              winner: serverTournament.winnerId ?
                { id: serverTournament.winnerId, username: serverTournament.players?.find((p: any) => (p.userId || p.id) === serverTournament.winnerId)?.username || `Player ${serverTournament.winnerId}` } : null,
              isLocal: serverTournament.isLocal || false,
            });

            // For local tournaments, skip the lobby and go directly to bracket view
            if (serverTournament.isLocal) {
              console.log("[Pong-Stable] Local tournament - skipping lobby, going to bracket view");
              setLobby(null);
              setCurrentView("tournament");
              return HandlerResult.Handled;
            }
          }

          setCurrentView("lobby");
        }
        return HandlerResult.Handled;
      }

      return HandlerResult.NotHandled;
    });

    return () => unsubscribe();
  }, [subscribe, setLobby, setTournament, setActiveTournamentId, setCurrentView]);

  // STABLE subscription for startFromLobby (separate from main effect to avoid missing GameStarted during subscription churn)
  useEffect(() => {
    if (!subscribe) return;

    const unsubscribe = subscribe(user_url.ws.pong.startFromLobby, (message, schema) => {
      console.log("[Pong-Stable] Received startFromLobby:", message.code);

      if (message.code === schema.output.GameStarted.code) {
        console.log("[Pong-Stable] Game started from lobby! Processing game state");
        const gameStatePayload = message.payload;

        // Preserve tournament ID before clearing lobby (use refs for stable access)
        const tournamentIdToPreserve = activeTournamentIdRef.current
          || tournamentRef.current?.tournamentId
          || (lobbyRef.current as any)?.tournament?.tournamentId
          || (lobbyRef.current as any)?.tournamentId;
        if (tournamentIdToPreserve) {
          console.log("[Pong-Stable] Preserving tournament ID:", tournamentIdToPreserve);
          setActiveTournamentId(tournamentIdToPreserve);
          // Store in bulletproof ref AND window
          tournamentGameRef.current = { tournamentId: tournamentIdToPreserve };
          (window as any).__pongTournamentId = tournamentIdToPreserve;
        }

        console.log("[Pong-Stable] Setting game state and transitioning to game view");
        const normalized = normalizeGameState(gameStatePayload);
        if (normalized) {
          setPlayerIDsHelper(normalized);
          setGameState(normalized);
        }
        // Preserve player data for leaderboard before clearing lobby
        const currentLobby = lobbyRef.current;
        if (currentLobby?.players) {
          if (currentLobby.gameMode === "1v1" && currentLobby.players.length === 1) {
            const hostPlayer = currentLobby.players[0];
            if (hostPlayer) {
              setGamePlayerIds([hostPlayer.id, -999]);
              setDebugPlayers([
                { id: hostPlayer.id, username: "WASD" },
                { id: -999, username: "Arrow" }
              ]);
            }
          } else {
            const allPlayers = currentLobby.players.map(p => ({ id: p.id, username: p.username }));
            const aiCount = currentLobby.settings?.aiCount || 0;
            for (let i = 0; i < aiCount; i++) {
              const aiId = -1001 - i;
              allPlayers.push({ id: aiId, username: `AI ${i + 1}` });
            }
            setGamePlayerIds(allPlayers.map(p => p.id));
            setDebugPlayers(allPlayers);
          }
        }
        setLobby(null);
        setCurrentView("game");
        return HandlerResult.Handled;
      }

      return HandlerResult.NotHandled;
    });

    return () => unsubscribe();
  }, [subscribe, setPlayerIDsHelper, setGameState, setLobby, setCurrentView, setDebugPlayers, setActiveTournamentId]);

  // STABLE subscription for tournament state updates (separate from main effect to avoid resubscribing on view changes)
  useEffect(() => {
    if (!subscribe) return;
    
    const unsubscribe = subscribe(user_url.ws.pong.tournamentMatchResult, (message, schema) => {
      console.log("[Pong-Stable] Received tournamentMatchResult:", message.code);
      
      if (message.code === schema.output.MatchResult.code) {
        const result = message.payload;
        console.log("[Pong-Stable] Tournament update received:", {
          tournamentId: result.tournamentId,
          matchId: result.matchId,
          winnerId: result.winnerId,
          matchCount: result.tournament?.matches?.length,
          finalsPlayers: result.tournament?.matches?.find((m: any) => m.round === result.tournament?.totalRounds)
        });
        
        // Always update tournament state with latest data from server
        if (result.tournament) {
          const tournamentFromServer = result.tournament;
          const mapPlayer = (p: any) => ({
            id: p.userId || p.id,
            username: p.username || `Player ${p.userId || p.id}`,
            alias: p.alias,
          });
          const findPlayer = (playerId: number | null) => {
            if (playerId === null) return null;
            const p = tournamentFromServer.players?.find((pl: any) => (pl.userId || pl.id) === playerId);
            return p ? mapPlayer(p) : null;
          };
          
          const newTournament: TournamentData = {
            tournamentId: tournamentFromServer.tournamentId,
            name: tournamentFromServer.name || "Tournament",
            mode: "tournament",
            players: tournamentFromServer.players?.map(mapPlayer) || [],
            matches: tournamentFromServer.matches?.map((m: any) => ({
              matchId: m.matchId,
              round: m.round,
              player1: findPlayer(m.player1Id),
              player2: findPlayer(m.player2Id),
              winner: m.winnerId,
              status: m.status,
              readyPlayers: m.readyPlayers || [],
              gameId: m.gameId ?? undefined,
            })) || [],
            currentRound: tournamentFromServer.currentRound || 1,
            totalRounds: tournamentFromServer.totalRounds || 2,
            status: tournamentFromServer.status === "completed" ? "completed" : "in_progress" as const,
            winner: findPlayer(tournamentFromServer.winnerId),
            onchainTxHashes: tournamentFromServer.onchainTxHashes || [],
            isLocal: tournamentFromServer.isLocal || false,
          };
          
          console.log("[Pong-Stable] Setting tournament state with finals:", 
            newTournament.matches.find(m => m.round === newTournament.totalRounds));
          
          setTournament(newTournament);
          setActiveTournamentId(tournamentFromServer.tournamentId);
        }
      }
      return HandlerResult.Handled;
    });
    
    return () => unsubscribe();
  }, [subscribe, setTournament, setActiveTournamentId]);

  // STABLE subscription for joinTournamentMatch (separate to avoid missing MatchStarted during subscription churn)
  useEffect(() => {
    if (!subscribe) return;
    
    const unsubscribe = subscribe(user_url.ws.pong.joinTournamentMatch, (message, schema) => {
      console.log("[Pong-Stable] Received joinTournamentMatch response:", message.code);
      
      if (message.code === schema.output.MatchStarted.code) {
        console.log("[Pong-Stable] Tournament match started! Transitioning to game view");
        const gameStatePayload = message.payload;
        
        // Set players from tournament data for score display (use ref)
        const currentTournament = tournamentRef.current;
        if (currentTournament?.players) {
          setDebugPlayers(currentTournament.players.map(p => ({ id: p.id, username: p.alias || p.username })));
        }
        
        const normalized = normalizeGameState(gameStatePayload);
        if (normalized) {
          setPlayerIDsHelper(normalized);
          // For local tournament matches, the host may not own any paddle.
          // Force playerOnePaddleID to 0 so keyboard handlers are active.
          if (currentTournament?.isLocal) {
            console.log("[Pong-Stable] Local tournament match - forcing keyboard activation");
            setPlayerOnePaddleID(0);
          }
          setGameState(normalized);
        }
        setLobby(null);
        setCurrentView("game");
        return HandlerResult.Handled;
      }
      
      // Waiting for opponent - show feedback
      if (message.code === schema.output.WaitingForOpponent.code) {
        console.log("[Pong-Stable] Waiting for opponent to be ready");
        // Could add toast notification here if desired
        return HandlerResult.Handled;
      }
      
      // Error cases - stay in tournament view
      if (message.code === schema.output.MatchNotReady.code) {
        console.warn("[Pong-Stable] Match not ready:", message.payload?.message);
        return HandlerResult.Handled;
      }
      if (message.code === schema.output.NotYourMatch.code) {
        console.warn("[Pong-Stable] Not your match:", message.payload?.message);
        return HandlerResult.Handled;
      }
      
      return HandlerResult.NotHandled;
    });
    
    return () => unsubscribe();
  }, [subscribe, setPlayerIDsHelper, setGameState, setLobby, setCurrentView, setDebugPlayers]);

  // STABLE subscription for spectateMatch
  useEffect(() => {
    if (!subscribe) return;
    
    const unsubscribe = subscribe(user_url.ws.pong.spectateMatch, (message, schema) => {
      console.log("[Pong-Stable] Received spectateMatch response:", message.code);
      
      if (message.code === schema.output.Spectating.code) {
        console.log("[Pong-Stable] Now spectating match!");
        const gameStatePayload = message.payload;
        
        // Set players from tournament data for score display
        const currentTournament = tournamentRef.current;
        if (currentTournament?.players) {
          setDebugPlayers(currentTournament.players.map(p => ({ id: p.id, username: p.alias || p.username })));
        }
        
        const normalized = normalizeGameState(gameStatePayload);
        if (normalized) {
          setPlayerIDsHelper(normalized);
          setGameState(normalized);
          // Update refs immediately so game state routing works before next render
          gameStateRef.current = normalized;
          // Remove this game from watched set so updates go to main view, not mini-preview
          if (normalized.board_id != null) {
            watchedGameIdsRef.current.delete(normalized.board_id);
          }
        }
        setLobby(null);
        setCurrentView("game");
        // Update view ref immediately so routing doesn't intercept updates
        currentViewRef.current = "game";
        return HandlerResult.Handled;
      }
      
      // Error cases - stay in tournament view
      if (message.code === schema.output.MatchNotInProgress.code) {
        console.warn("[Pong-Stable] Match not in progress:", message.payload?.message);
        return HandlerResult.Handled;
      }
      if (message.code === schema.output.NotInTournament.code) {
        console.warn("[Pong-Stable] Not in tournament:", message.payload?.message);
        return HandlerResult.Handled;
      }
      
      return HandlerResult.NotHandled;
    });
    
    return () => unsubscribe();
  }, [subscribe, setPlayerIDsHelper, setGameState, setLobby, setCurrentView, setDebugPlayers]);

  // STABLE subscription for watchTournamentMatches (passive spectate for mini-previews)
  useEffect(() => {
    if (!subscribe) return;

    const unsubscribe = subscribe(user_url.ws.pong.watchTournamentMatches, (message, schema) => {
      console.log("[Pong-Stable] Received watchTournamentMatches response:", message.code);

      if (message.code === schema.output.Watching.code) {
        const { watching } = message.payload as { watching: Array<{ matchId: number; gameId: number }> };
        console.log("[Pong-Stable] Now watching", watching.length, "tournament matches:", watching);
        // Populate the watched game IDs set
        const newIds = new Set<number>();
        for (const w of watching) {
          newIds.add(w.gameId);
        }
        watchedGameIdsRef.current = newIds;
        // Clear stale game states
        const newStates: Record<number, TypeGameStateSchema> = {};
        for (const id of newIds) {
          if (watchedGameStatesRef.current[id]) {
            newStates[id] = watchedGameStatesRef.current[id];
          }
        }
        watchedGameStatesRef.current = newStates;
        setWatchedStatesVersion(v => v + 1);
        return HandlerResult.Handled;
      }

      if (message.code === schema.output.NotInTournament.code) {
        console.warn("[Pong-Stable] Cannot watch tournament:", message.payload?.message);
        return HandlerResult.Handled;
      }

      return HandlerResult.NotHandled;
    });

    return () => unsubscribe();
  }, [subscribe]);

  // Auto-watch tournament matches when in tournament view with in_progress matches
  useEffect(() => {
    if (currentView !== "tournament" || !tournament || !activeTournamentId || !isConnected) {
      // Clear watched state when leaving tournament view
      watchedGameIdsRef.current = new Set();
      watchedGameStatesRef.current = {};
      return;
    }

    const hasInProgressMatches = tournament.matches.some(m => m.status === "in_progress");
    if (!hasInProgressMatches) return;

    console.log("[Pong] Auto-watching tournament matches for mini-previews");
    sendMessage(user_url.ws.pong.watchTournamentMatches, {
      tournamentId: activeTournamentId,
    });
  }, [currentView, tournament, activeTournamentId, isConnected, sendMessage]);

  // Subscribe to game state updates
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];
    
    // Subscribe to getGameState
    unsubscribers.push(subscribe(user_url.ws.pong.getGameState, (message, schema) => {
      // Debug logging disabled for performance
      // console.log("[Pong] Received getGameState:", message.code);
      
      if (message.code === schema.output.GameUpdate.code) {
        const normalized = normalizeGameState(message.payload);
        const incomingBoardId = normalized?.board_id ?? message.payload?.board_id ?? message.payload?.boardId;

        // Route to mini-preview if this is a watched tournament match and we're in tournament view
        if (incomingBoardId != null && watchedGameIdsRef.current.has(incomingBoardId) && currentViewRef.current === "tournament") {
          if (normalized) {
            watchedGameStatesRef.current[incomingBoardId] = normalized;
            // Throttle bracket re-renders to ~10fps
            const now = Date.now();
            if (now - watchedThrottleRef.current > 100) {
              watchedThrottleRef.current = now;
              setWatchedStatesVersion(v => v + 1);
            }
          }
          return HandlerResult.Handled;
        }

        // Drop game updates when in tournament view but not actively playing
        // (e.g. spectator returned to bracket — server still sends updates until unsubscribed)
        if (currentViewRef.current === "tournament" && gameStateRef.current === null) {
          return HandlerResult.Handled;
        }

        if (message.payload?.gameOver) {
          console.log("[Pong] 🎮 GAME OVER RECEIVED!", { 
            gameOver: message.payload.gameOver, 
            winner: message.payload.winner,
            score: message.payload.score,
            metadata: message.payload.metadata,
            tournamentGameRef: tournamentGameRef.current,
          });
          // Restore tournament ID from game metadata or ref
          const metaTournamentId = message.payload.metadata?.tournamentId
            || (message.payload as any)?.tournamentId
            || tournamentGameRef.current?.tournamentId;
          if (metaTournamentId) {
            console.log("[Pong] 🎮 Restoring activeTournamentId from metadata/ref:", metaTournamentId);
            setActiveTournamentId(metaTournamentId);
          }
        }
        // Ignore stale GameUpdates from old games: if we have a current game,
        // only accept updates for that same board_id.
        const currentBoardId = gameStateRef.current?.board_id;
        if (currentBoardId != null && incomingBoardId != null && currentBoardId !== incomingBoardId) {
          console.log("[Pong] Ignoring stale GameUpdate for board", incomingBoardId, "(current:", currentBoardId, ")");
          return HandlerResult.Handled;
        }
        setGameState(normalized);
        gameStateReceivedRef.current = true;
        // Only set paddle IDs once when first receiving game state (not on every frame)
        if (!gameStateRef.current || gameStateRef.current.board_id !== normalized?.board_id) {
          if (normalized) {
            setPlayerIDsHelper(normalized);
          }
          // Sync color map from server's authoritative allPlayers list so
          // web colours always match the CLI (which also uses metadata.allPlayers).
          const metaAllPlayers = normalized?.metadata?.allPlayers;
          if (Array.isArray(metaAllPlayers) && metaAllPlayers.length > 0) {
            setGamePlayerIds(metaAllPlayers);
          }
        }
        // If we received valid game state and we're not in game view, switch to it
        // But NOT if we're in the tournament bracket view — the user navigated there deliberately
        if (currentViewRef.current !== 'game' && currentViewRef.current !== 'tournament' && message.payload?.board_id && normalized && !normalized.gameOver) {
          console.log("[Pong] Received game state while not in game view, transitioning to game");
          // For local tournaments, the host doesn't own any paddle so
          // setPlayerIDsHelper above won't activate the keyboard handler.
          // Force it here so controls work even if this fires before the
          // joinTournamentMatch response.
          if (tournamentRef.current?.isLocal) {
            setPlayerOnePaddleID(0);
          }
          // Preserve player data for leaderboard before clearing lobby
          const currentLobby = lobbyRef.current;
          if (currentLobby?.players) {
            // For local 1v1 mode with only 1 player, use WASD and Arrow as names
            if (currentLobby.gameMode === "1v1" && currentLobby.players.length === 1) {
              const hostPlayer = currentLobby.players[0];
              if (hostPlayer) {
                setGamePlayerIds([hostPlayer.id, -999]);
                setDebugPlayers([
                  { id: hostPlayer.id, username: "WASD" },
                  { id: -999, username: "Arrow" }
                ]);
              }
            } else {
              // Add human players
              const allPlayers = currentLobby.players.map(p => ({ id: p.id, username: p.username }));
              // Add AI players if present
              const aiCount = currentLobby.settings?.aiCount || 0;
              for (let i = 0; i < aiCount; i++) {
                const aiId = -1001 - i; // AI IDs are -1001, -1002, etc.
                allPlayers.push({ id: aiId, username: `AI ${i + 1}` });
              }
              setGamePlayerIds(allPlayers.map(p => p.id));
              setDebugPlayers(allPlayers);
            }
          }
          setLobby(null);
          setCurrentView("game");
        }
        return HandlerResult.Handled;
      } else if (message.code === schema.output.NotInRoom.code) {
        console.log("[Pong] User not in any game room - this is normal if no game exists");
        return HandlerResult.Handled;
      }
      
      return HandlerResult.NotHandled;
    }));
    
    // Subscribe to startGame
    unsubscribers.push(subscribe(user_url.ws.pong.startGame, (message, schema) => {
      console.log("[Pong] Received startGame:", message.code);
      
      if (message.code === schema.output.GameInstanceCreated.code) {
        console.log("[Pong] Game started, received game info:", message.payload);
        if (message.payload && typeof message.payload.board_id === 'number') {
          setLastCreatedBoardId(message.payload.board_id);
          // Request game state after game creation
          if (isConnected) {
            sendMessage(user_url.ws.pong.getGameState, { gameId: message.payload.board_id });
            console.log("[Pong] Requested game state after game creation");
          }
        }
        return HandlerResult.Handled;
      }
      
      return HandlerResult.NotHandled;
    }));
    
    // NOTE: createLobby subscription has been moved to a STABLE useEffect above
    // to prevent missing LobbyCreated messages during subscription churn
    
    // NOTE: togglePlayerReady subscription has been moved to a STABLE useEffect above
    // to prevent missing messages during subscription churn
    
    // NOTE: startFromLobby subscription has been moved to a STABLE useEffect above
    // to prevent missing GameStarted messages during subscription churn

    // NOTE: joinTournamentMatch subscription has been moved to a STABLE useEffect above
    // to prevent missing MatchStarted messages during subscription churn

    // Subscribe to tournament match results for game over UI (tournament state is handled by stable subscription above)
    unsubscribers.push(subscribe(user_url.ws.pong.tournamentMatchResult, (message, schema) => {
      if (message.code === schema.output.MatchResult.code) {
        const result = message.payload;
        
        // Note: Tournament state update is handled by the stable subscription above
        // This handler only deals with game over UI state
        
        // Store match result info for game over UI
        const mapResultPlayer = (playerId: number | null): { id: number; username: string; alias?: string } | null => {
          if (playerId === null) return null;
          const p: any = result.tournament?.players?.find((player: any) => (player.userId || player.id) === playerId);
          if (!p) return null;
          const mapped: { id: number; username: string; alias?: string } = { 
            id: p.userId || p.id, 
            username: p.username || `Player ${playerId}` 
          };
          if (p.alias) mapped.alias = p.alias;
          return mapped;
        };
        
        const nextMatch: TournamentMatch | null = result.nextMatch ? {
          matchId: result.nextMatch.matchId,
          round: result.nextMatch.round,
          player1: mapResultPlayer(result.nextMatch.player1Id),
          player2: mapResultPlayer(result.nextMatch.player2Id),
          winner: result.nextMatch.winnerId,
          status: result.nextMatch.status,
          readyPlayers: result.nextMatch.readyPlayers || [],
        } : null;
        
        // If winnerId is 0, this is a "match started" notification for spectators
        // They should go to tournament view (not game view since they're not playing)
        if (result.winnerId === 0 && currentViewRef.current !== 'game') {
          console.log("[Pong] Match started notification for non-participant, going to tournament view");
          setLobby(null); // Clear any lobby state
          setCurrentView("tournament");
          // Don't set match result for spectators
          return HandlerResult.Handled;
        }
        
        setTournamentMatchResult({
          tournamentId: result.tournamentId,
          matchId: result.matchId,
          winnerId: result.winnerId,
          loserId: result.loserId,
          nextMatch,
          isTournamentComplete: result.isTournamentComplete,
        });
        
        return HandlerResult.Handled;
      }
      
      return HandlerResult.NotHandled;
    }));
    
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [subscribe, isConnected, sendMessage, setGameState, setLobby, setCurrentView, setLastCreatedBoardId, setPlayerIDsHelper, setDebugPlayers, setTournamentMatchResult, setActiveTournamentId]);

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
          ballCount: storedLobbyData.ballCount ?? 1,
          maxScore: storedLobbyData.maxScore ?? 5,
          allowPowerups: storedLobbyData.allowPowerups ?? false,
          aiCount: storedLobbyData.aiCount ?? 0,
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
  }, [acceptedLobbyId, onLobbyJoined, setLobby, setActiveTournamentId, setCurrentView])

  // =========================
  // WebSocket Send Helpers
  // =========================

  const handleUserInput = useCallback(
    (wshandlerinfo: any, payload: any) => {
      sendMessage(wshandlerinfo, payload)
    },
    [sendMessage],
  )

  // =========================
  // Keyboard input (W / S)
  // =========================
  useEffect(() => {
    const keysPressed = new Set<string>()
    function handleKeyDown(e: KeyboardEvent) {
      const gs = gameStateRef.current
      if (gs === null || playerOnePaddleID === -1) return
      const key = e.key.toLowerCase()
      if (keysPressed.has(key)) return
      keysPressed.add(key)

      // Update pressed keys for client-side prediction
      setPressedKeys(Array.from(keysPressed))

      if (gs.board_id === null) return
      const payload: TypeHandleGameKeysSchema = {
        board_id: gs.board_id,
        pressed_keys: Array.from(keysPressed),
      }
      // console.debug for debugging stuck keys
      // console.debug('[Pong] KeyDown', key, payload.pressed_keys)
      handleUserInput(user_url.ws.pong.handleGameKeys, payload)
    }

    function handleKeyUp(e: KeyboardEvent) {
      const gs = gameStateRef.current
      if (gs === null || playerOnePaddleID === -1) return
      const key = e.key.toLowerCase()
      keysPressed.delete(key)

      // Update pressed keys for client-side prediction
      setPressedKeys(Array.from(keysPressed))

      const payload = {
        board_id: gs.board_id,
        pressed_keys: Array.from(keysPressed),
      }
      // console.debug('[Pong] KeyUp', key, payload.pressed_keys)
      handleUserInput(user_url.ws.pong.handleGameKeys, payload)
    }

    // Clear pressed keys when window loses focus (fixes stuck keys after alt-tab)
    function handleFocusLost() {
      if (keysPressed.size === 0) return
      keysPressed.clear()
      setPressedKeys([])
      const gs = gameStateRef.current
      if (gs?.board_id) {
        handleUserInput(user_url.ws.pong.handleGameKeys, {
          board_id: gs.board_id,
          pressed_keys: [],
        })
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) handleFocusLost()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleFocusLost)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleFocusLost)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [handleUserInput, playerOnePaddleID])

  // =========================
  // Keyboard input (O / L)
  // =========================
  useEffect(() => {
    const keysPressed = new Set<string>()
    function handleKeyDown(e: KeyboardEvent) {
      const gs = gameStateRef.current
      if (gs === null || playerTwoPaddleID < 0) return
      const key = e.key.toLowerCase()
      if (keysPressed.has(key)) return
      keysPressed.add(key)

      // Update pressed keys for client-side prediction
      setPressedKeys(Array.from(keysPressed))

      if (gs.board_id === null) return
      const payload: TypeHandleGameKeysSchema = {
        board_id: gs.board_id,
        pressed_keys: Array.from(keysPressed),
      }
      // console.debug('[Pong] KeyDown (player2)', key, payload.pressed_keys)
      handleUserInput(user_url.ws.pong.handleGameKeys, payload)
    }

    function handleKeyUp(e: KeyboardEvent) {
      const gs = gameStateRef.current
      if (gs === null || playerTwoPaddleID < 0) return
      const key = e.key.toLowerCase()
      keysPressed.delete(key)

      // Update pressed keys for client-side prediction
      setPressedKeys(Array.from(keysPressed))

      const payload = {
        board_id: gs.board_id,
        pressed_keys: Array.from(keysPressed),
      }
      // console.debug('[Pong] KeyUp (player2)', key, payload.pressed_keys)
      handleUserInput(user_url.ws.pong.handleGameKeys, payload)
    }

    // Clear pressed keys when window loses focus (fixes stuck keys after alt-tab)
    function handleFocusLost() {
      if (keysPressed.size === 0) return
      keysPressed.clear()
      setPressedKeys([])
      const gs = gameStateRef.current
      if (gs?.board_id) {
        handleUserInput(user_url.ws.pong.handleGameKeys, {
          board_id: gs.board_id,
          pressed_keys: [],
        })
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) handleFocusLost()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleFocusLost)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleFocusLost)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [handleUserInput, playerTwoPaddleID])

  // =========================
  // 3D Rendering is handled by BabylonPongRenderer component
  // =========================
  // NOTE: Debug powerup keys (1-7) are handled by the existing W/S and O/L handlers
  // since they pass through ALL pressed keys to the server.


  // Handler for creating a game from invite modal
  const handleCreateGame = useCallback(
    (mode: GameMode, selectedPlayers: number[], settings: GameSettings, modalPlayerUsernames?: { [key: number]: string }) => {
      console.log("[Pong] Creating game:", { mode, selectedPlayers, settings })

      // Resolve username for a player ID using the best available source
      const resolveUsername = (id: number): string => {
        return modalPlayerUsernames?.[id]
          || inviteRoomUsers.find((u) => u.id === id)?.username
          || (id === authResponse?.user?.id ? authResponse.user.username : `User ${id}`)
      }

      // Create a lobby for this game
      const newLobby: PongLobbyData = {
        lobbyId: Date.now(), // Temporary ID until backend assigns one
        gameMode: mode,
        players: selectedPlayers.map((id) => ({
          id,
          username: resolveUsername(id),
          isReady: false,
          isHost: id === authResponse?.user?.id,
        })),
        settings: {
          ballCount: settings.ballCount,
          maxScore: settings.maxScore,
          allowPowerups: settings.allowPowerups,
          aiCount: settings.aiCount,
          aiDifficulty: settings.aiDifficulty,
        },
        status: "waiting",
      }

      setLobby(newLobby)

      // Send lobby creation to backend with username map
      const playerUsernames: { [key: number]: string } = {}
      selectedPlayers.forEach(id => {
        playerUsernames[id] = resolveUsername(id)
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
          aiCount: settings.aiCount,
          aiDifficulty: settings.aiDifficulty,
          ...(settings.localPlayerNames ? { localPlayerNames: settings.localPlayerNames } : {}),
        },
        target_container: "pong",
      }

      if (isConnected) {
        sendMessage(user_url.ws.pong.createLobby, payload.payload)
        console.log("[Pong] Sent lobby creation to backend:", payload)
      }

      // For tournaments, store minimal tournament info for the lobby view.
      // The full bracket data (with matches) will arrive from the server
      // via the stable createLobby subscription — do NOT set matches here
      // as it would overwrite the server data due to React state batching.
      // Store game mode in window for debugging and as indestructible backup
      (window as any).__pongGameMode = mode;
      if (mode === "tournament") {
        // Mark that we started a tournament — this survives everything except page refresh
        (window as any).__pongTournamentPending = true;
        console.log("[Pong] 🏆 Tournament game created, set window.__pongTournamentPending=true");
      }

      setCurrentView("lobby")

      setShowInviteModalLocal(false)
      onCloseInviteModal?.()
    },
    [authResponse, inviteRoomUsers, onCloseInviteModal, isConnected, sendMessage, setTournament, setCurrentView, setShowInviteModalLocal]
  )

  // Handler for toggling ready state in lobby
  const handleToggleReady = useCallback(() => {
    if (!lobby || !authResponse) return

    console.log("[Pong] Toggling ready state for lobby:", lobby.lobbyId)

    // Send toggle ready to backend
    const payload = {
      lobbyId: lobby.lobbyId,
    }

    if (isConnected) {
      sendMessage(user_url.ws.pong.togglePlayerReady, payload)
      console.log("[Pong] Sent toggle ready to backend")
    } else {
      console.warn("[Pong] WebSocket not open, cannot toggle ready")
    }
  }, [lobby, authResponse, isConnected, sendMessage])

  // Handler for starting game from lobby
  const handleStartGameFromLobby = useCallback(() => {
    if (!lobby || !authResponse) return

    console.log("[Pong] Starting game from lobby:", lobby.lobbyId)

    // Preserve tournament ID before anything else
    const tournamentId = tournament?.tournamentId || (lobby as any)?.tournament?.tournamentId || (lobby as any)?.tournamentId || (window as any).__pongTournamentId
    if (tournamentId) {
      console.log("[Pong] Preserving tournament ID for game start:", tournamentId)
      setActiveTournamentId(tournamentId)
      tournamentGameRef.current = { tournamentId };
      (window as any).__pongTournamentId = tournamentId;
    }

    // Send start game request to backend with lobby ID
    const payload = {
      lobbyId: lobby.lobbyId,
    }

    if (isConnected) {
      sendMessage(user_url.ws.pong.startFromLobby, payload)
      console.log("[Pong] Sent start game from lobby to backend")
      setLobby({ ...lobby, status: "starting" })

      // Fallback: if we don't transition to game within 2 seconds, request game state
      // This handles cases where the WebSocket message doesn't trigger the effect for the host
      setTimeout(() => {
        console.log("[Pong] Fallback check: currentView after start request")
        // Request game state - if we're in a game, the response will trigger the transition
        if (isConnected) {
          sendMessage(user_url.ws.pong.getGameState, { gameId: 1 })
        }
      }, 1500)
    } else {
      console.warn("[Pong] WebSocket not open, cannot start game")
    }
  }, [lobby, authResponse, isConnected, sendMessage, tournament, setActiveTournamentId, setLobby])

  // Handler for leaving lobby
  const handleLeaveLobby = useCallback(() => {
    if (lobby && isConnected) {
      console.log("[Pong] Leaving lobby:", lobby.lobbyId)
      sendMessage(user_url.ws.pong.leaveLobby, { lobbyId: lobby.lobbyId })
    }
    setLobby(null)
    setTournament(null)
    setCurrentView("menu")
    // Navigate back to chat page
    if (onNavigateToChat) {
      onNavigateToChat()
    }
  }, [lobby, isConnected, sendMessage, onNavigateToChat, setLobby, setTournament, setCurrentView])

  // Tournament handlers
  const handleJoinTournamentMatch = useCallback(
    (matchId: number) => {
      if (!activeTournamentId || !isConnected) {
        console.warn("[Pong] Cannot join match - no active tournament or not connected");
        return;
      }
      const isLocal = tournamentRef.current?.isLocal;
      console.log("[Pong] Joining tournament match:", matchId, "in tournament:", activeTournamentId, isLocal ? "(local)" : "");
      sendMessage(user_url.ws.pong.joinTournamentMatch, { 
        tournamentId: activeTournamentId, 
        matchId,
        ...(isLocal ? { asLocalHost: true } : {}),
      });
    },
    [activeTournamentId, isConnected, sendMessage]
  )

  const handleSpectate = useCallback(
    (matchId: number) => {
      if (!activeTournamentId || !isConnected) {
        console.warn("[Pong] Cannot spectate - no active tournament or not connected");
        return;
      }
      console.log("[Pong] Spectating tournament match:", matchId, "in tournament:", activeTournamentId);
      sendMessage(user_url.ws.pong.spectateMatch, { 
        tournamentId: activeTournamentId, 
        matchId 
      });
    },
    [activeTournamentId, isConnected, sendMessage]
  )

  // Stable callback for MiniPongCanvas to read watched game states without React re-renders
  const getWatchedGameState = useCallback(
    (gameId: number): TypeGameStateSchema | null => {
      return watchedGameStatesRef.current[gameId] ?? null;
    },
    []
  )

  // RENDER LOGIC
  // Debug logging disabled for performance
  // console.log("[Pong] RENDER called, currentView =", currentView);

  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-gray-100/80 dark:bg-dark-600 p-4 space-y-4">
      {/* Pong Invitation Notifications now rendered globally in AppRoot */}

      {/* Menu View */}
      {currentView === "menu" && (
        <div className="flex flex-col items-center justify-center w-full h-full gap-6">
          <h2 className="text-3xl font-bold text-white">🏓 Pong</h2>
          <p className="text-gray-400 text-center max-w-md">
            {t('pong.menuDescription')}
          </p>
          <button
            onClick={() => setShowInviteModalLocal(true)}
            className="px-8 py-4 text-xl bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-600 transition-all shadow-lg"
          >
            🎮 {t('pong.createGameButton')}
          </button>
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
            onJoinMatch={handleJoinTournamentMatch}
            onSpectate={handleSpectate}
            getWatchedGameState={getWatchedGameState}
            watchedStatesVersion={watchedStatesVersion}
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
        <div className="fixed inset-0 z-[2147483647] bg-[#1a1a2e] flex flex-col">
          {/* Header */}
          <div className="px-5 py-2.5 bg-black/50 flex justify-between items-center shrink-0">
            <span className="text-white text-lg">🏓 {t('pong.title')}</span>
            <button
              onClick={() => {
                console.log("[Pong] Back button clicked during game");
                // If in an active tournament, go back to bracket view instead of fully exiting
                const tid = activeTournamentIdRef.current || tournamentRef.current?.tournamentId;
                if (tid && tournamentRef.current) {
                  console.log("[Pong] Returning to tournament bracket view");
                  // Save tournament data before reset (resetGameState clears everything)
                  const savedTournament = tournamentRef.current;
                  const savedTournamentId = tid;
                  resetGameState();
                  // Restore tournament context so bracket view can render
                  setTournament(savedTournament);
                  setActiveTournamentId(savedTournamentId);
                  setCurrentView("tournament");
                  return;
                }
                if (lobbyRef.current && isConnected) {
                  sendMessage(user_url.ws.pong.leaveLobby, { lobbyId: lobbyRef.current.lobbyId })
                }
                resetGameState();
                tournamentGameRef.current = null;
                (window as any).__pongTournamentId = undefined;
                (window as any).__pongGameMode = undefined;
                (window as any).__pongTournamentPending = undefined;
                if (onNavigateToChatRef.current) {
                  onNavigateToChatRef.current();
                }
              }}
              className="px-4 py-2 bg-red-600 text-white rounded cursor-pointer hover:bg-red-700 transition"
            >
              ← {t('pong.backToMenu')}
            </button>
          </div>

          {/* Game Area */}
          <div className="flex-1 relative overflow-hidden">
            {gameState && (
              <BabylonPongRenderer
                ref={rendererRef}
                gameState={predictedGameState || gameState}
                darkMode={darkMode}
                gameMode={lobby?.gameMode ?? (gameState.metadata as any)?.gameOptions?.gameMode ?? null}
                paddleRotationOffset={paddleRotationOffset}
              />
            )}
            {/* Leaderboard Overlay */}
            {gameState && (lobby || debugPlayers || gameState.metadata) && (
              <PongLeaderboard
                players={(() => {
                  // Build complete player list from all available sources
                  // 1. Use playerUsernames from metadata (server-authoritative, includes AI players)
                  const playerUsernames = (gameState.metadata as any)?.playerUsernames as Record<string, string> | undefined;
                  const allOriginalPlayerIds: number[] = (gameState.metadata as any)?.allPlayers ?? [];
                  
                  // Check if this is a local 1v1 game (debugPlayers has the -999 Arrow entry)
                  const isLocal1v1 = debugPlayers?.some(p => p.id === -999);

                  // If metadata has playerUsernames, use it as the primary source (most reliable)
                  // But for local 1v1, prefer debugPlayers names (WASD / Arrow)
                  if (playerUsernames && allOriginalPlayerIds.length > 0) {
                    return allOriginalPlayerIds.map(playerId => ({
                      id: playerId,
                      username: (isLocal1v1 ? debugPlayers?.find(p => p.id === playerId)?.username : undefined)
                        ?? (isLocal1v1 ? undefined : playerUsernames[String(playerId)])
                        ?? debugPlayers?.find(p => p.id === playerId)?.username
                        ?? playerUsernames[String(playerId)]
                        ?? lobby?.players?.find(p => p.id === playerId)?.username
                        ?? `Player ${playerId}`,
                    }));
                  }
                  
                  // Fallback: Start with lobby players or debugPlayers
                  const lobbyPlayers = lobby ? lobby.players.map(p => ({ id: p.id, username: p.username })) : (debugPlayers || []);
                  const knownIds = new Set(lobbyPlayers.map(p => p.id));
                  
                  // Add any players from allPlayers that aren't in lobby (e.g. AI players)
                  const additionalPlayers: { id: number; username: string }[] = [];
                  for (const playerId of allOriginalPlayerIds) {
                    if (!knownIds.has(playerId)) {
                      const username = playerUsernames?.[String(playerId)] ?? `Player ${playerId}`;
                      additionalPlayers.push({ id: playerId, username });
                    }
                  }
                  
                  return [...lobbyPlayers, ...additionalPlayers];
                })()}
                scores={gameState.score}
              />
            )}
            {/* Powerup Display Overlay */}
            {gameState && (() => {
              const effects = gameState.activeEffects ?? []
              const events = gameState.recentEvents ?? []
              return (
                <PowerupDisplay
                  activeEffects={effects}
                  recentEvents={events}
                />
              )
            })()}
          </div>

          {/* Game Over Overlay */}
          {gameState?.gameOver && (
            <div className="fixed inset-0 z-[2147483648] bg-black/85 flex flex-col items-center justify-center">
              <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border-4 border-yellow-400 rounded-2xl p-12 text-center shadow-2xl max-w-lg">
                {/* Tournament Winner - Show special celebration if tournament is complete */}
                {tournamentMatchResult?.isTournamentComplete && myUserId === tournamentMatchResult.winnerId ? (
                  <>
                    <h1 className="text-yellow-400 text-5xl mb-3 drop-shadow-lg">🏆 {t('pong.tournamentWinner')} 🏆</h1>
                    <p className="text-white text-2xl mb-6">{t('pong.congratulations')}</p>
                    {tournament?.onchainTxHashes && tournament.onchainTxHashes.length > 0 && (
                      <p className="text-green-400 text-sm mb-6">
                        {t('pong.recordedOnBlockchain')} ✓
                      </p>
                    )}
                  </>
                ) : tournamentMatchResult?.isTournamentComplete ? (
                  <>
                    <h1 className="text-yellow-400 text-5xl mb-3 drop-shadow-lg">{t('pong.tournamentComplete')}</h1>
                    <p className="text-white text-2xl mb-6">
                      {t('pong.winner')}: <span className="text-green-500 font-bold">{
                        (() => {
                          const winnerId = tournamentMatchResult?.winnerId || tournament?.winner?.id;
                          const player = tournament?.players?.find(p => p.id === winnerId);
                          return player?.alias || player?.username || `Player ${winnerId}`;
                        })()
                      }</span>
                    </p>
                    {tournament?.onchainTxHashes && tournament.onchainTxHashes.length > 0 && (
                      <p className="text-green-400 text-sm mb-6">
                        {t('pong.recordedOnBlockchain')} ✓
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h1 className="text-yellow-400 text-6xl mb-5 drop-shadow-lg">{t('pong.gameOverText')}</h1>
                    <p className="text-white text-3xl mb-8">{t('pong.winner')}: <span className="text-green-500 font-bold">{
                      (() => {
                        const winnerId = gameState.winner;
                        const playerUsernames = (gameState.metadata as any)?.playerUsernames as Record<string, string> | undefined;
                        const players = debugPlayers || tournament?.players?.map(p => ({ id: p.id, username: p.alias || p.username })) || lobby?.players?.map(p => ({ id: p.id, username: p.username })) || [];
                        const winner = players.find(p => p.id === winnerId);
                        return winner?.username || (winnerId != null ? playerUsernames?.[String(winnerId)] : undefined) || `${t('pong.player')} ${winnerId}`;
                      })()
                    }</span></p>
                  </>
                )}
                
                {/* Score display */}
                <p className="text-gray-400 text-2xl mb-8">
                  {gameState.score
                    ? Object.entries(gameState.score).map(([p, s]: [string, any]) => {
                        const playerId = parseInt(p);
                        const playerUsernames = (gameState.metadata as any)?.playerUsernames as Record<string, string> | undefined;
                        const players = debugPlayers || tournament?.players?.map(pl => ({ id: pl.id, username: pl.alias || pl.username })) || lobby?.players?.map(pl => ({ id: pl.id, username: pl.username })) || [];
                        const player = players.find(pl => pl.id === playerId);
                        const name = player?.username || playerUsernames?.[String(playerId)] || `${t('pong.player')} ${p}`;
                        return `${name}: ${s}`;
                      }).join(' | ')
                    : ''}
                </p>

                {/* Tournament-specific messaging */}
                {/* Compute effective tournament status from all available sources (defensive fallback) */}
                {(activeTournamentId || tournament?.tournamentId || tournamentMatchResult?.tournamentId) && (() => {
                  // Check if I won or lost my completed match
                  const myCompletedMatch = tournament?.matches.find(m =>
                    m.status === 'completed' &&
                    (m.player1?.id === myUserId || m.player2?.id === myUserId)
                  );
                  const iWon = myCompletedMatch && myCompletedMatch.winner === myUserId;
                  const iLost = myCompletedMatch && myCompletedMatch.winner !== myUserId;
                  
                  const isTournamentComplete = tournament?.status === 'completed';
                  
                  console.log('[GameOver] Tournament state debug:', {
                    myUserId,
                    tournamentStatus: tournament?.status,
                    myCompletedMatch: myCompletedMatch ? { matchId: myCompletedMatch.matchId, winner: myCompletedMatch.winner } : null,
                    iWon,
                    iLost,
                    isTournamentComplete,
                  });
                  
                  return (
                    <div className="mb-6">
                      {isTournamentComplete ? (
                        <p className="text-gray-300 text-lg">{t('pong.tournamentEnded')}</p>
                      ) : iLost ? (
                        <div>
                          <p className="text-red-400 text-lg mb-1">{t('pong.eliminatedFromTournament')}</p>
                          <p className="text-gray-400 text-sm">You can spectate the remaining matches from the bracket view</p>
                        </div>
                      ) : iWon ? (
                        <p className="text-green-400 text-lg">{t('pong.advancingToNextRound')}</p>
                      ) : (
                        <p className="text-gray-300 text-lg">{t('pong.matchComplete')}</p>
                      )}
                    </div>
                  );
                })()}

                {/* Action Buttons */}
                <div className="flex flex-col gap-4">
                  {/* Tournament: Show "Continue to Bracket" button */}
                  {(() => {
                    const effectiveTournamentId = activeTournamentId || tournament?.tournamentId || tournamentMatchResult?.tournamentId;
                    const isTournamentComplete = tournament?.status === 'completed';
                    const isLocal = tournament?.isLocal;
                    
                    // For local tournaments, always show continue (host controls the flow)
                    // For remote tournaments, show continue only if the user won their match
                    const myCompletedMatch = tournament?.matches.find(m =>
                      m.status === 'completed' &&
                      m.winner === myUserId
                    );
                    const showContinue = effectiveTournamentId && !isTournamentComplete && (isLocal || myCompletedMatch);
                    
                    if (showContinue) {
                      return (
                        <button
                          onClick={() => {
                            console.log("[Pong] Continuing to tournament bracket");
                            setTournamentMatchResult(null);
                            setGameState(null);
                            setPlayerOnePaddleID(-1);
                            setPlayerTwoPaddleID(-2);
                            setCurrentView("tournament");
                          }}
                          className="px-12 py-4 text-xl bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-600 transition-all"
                        >
                          {isLocal ? "⬅️ Back to Bracket" : t('pong.continueToNextMatch')}
                        </button>
                      );
                    }
                    return null;
                  })()}

                  {/* Tournament: Show "View Tournament" / "Watch Tournament" button to see bracket */}
                  {/* Hidden for local tournaments since "Back to Bracket" already does this */}
                  {!tournament?.isLocal && (activeTournamentId || tournament?.tournamentId || tournamentMatchResult?.tournamentId) && tournament && (() => {
                    // Check if eliminated (lost and tournament still going)
                    const iEliminated = tournament.status !== 'completed' && tournament.matches.some(m =>
                      m.status === 'completed' &&
                      (m.player1?.id === myUserId || m.player2?.id === myUserId) &&
                      m.winner !== myUserId
                    );
                    return (
                      <button
                        onClick={() => {
                          console.log("[Pong] Viewing tournament bracket");
                          setTournamentMatchResult(null);
                          setGameState(null);
                          setCurrentView("tournament");
                        }}
                        className={`px-12 py-4 text-xl rounded-xl font-bold transition-all ${
                          iEliminated
                            ? 'bg-blue-500 text-white hover:bg-blue-600 animate-pulse'
                            : 'bg-purple-500 text-white hover:bg-purple-600'
                        }`}
                      >
                        {iEliminated ? '👁️ Watch Tournament' : t('pong.viewTournament')}
                      </button>
                    );
                  })()}

                  {/* Always show "Back to Menu" option */}
                  <button
                    onClick={() => {
                      console.log("[Pong] Game over back button clicked");
                      if (lobbyRef.current && isConnected) {
                        sendMessage(user_url.ws.pong.leaveLobby, { lobbyId: lobbyRef.current.lobbyId })
                      }
                      resetGameState();
                      tournamentGameRef.current = null;
                      (window as any).__pongTournamentId = undefined;
                      (window as any).__pongGameMode = undefined;
                      (window as any).__pongTournamentPending = undefined;
                      if (onNavigateToChatRef.current) {
                        onNavigateToChatRef.current();
                      }
                    }}
                    className={`px-12 py-4 text-xl ${(activeTournamentId || tournament?.tournamentId || tournamentMatchResult?.tournamentId) ? 'bg-gray-600 hover:bg-gray-700' : 'bg-green-500 hover:bg-green-600'} text-white rounded-xl font-bold transition-all`}
                  >
                    {t('pong.backToMenu')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
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


    </div>
  )
}
