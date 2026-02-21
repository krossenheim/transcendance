"use client"

import { useCallback, useEffect, useState, useRef } from "react"

import type {
  TypeHandleGameKeysSchema,
  TypeStartNewPongGame,
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
  // Helper: normalize server GameState (tuples) to frontend-friendly objects
  const normalizeGameState = (raw: any) => {
    if (!raw) return null

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
    const edges = (raw.walls || []).filter((w: any) => w != null).map((w: any) => {
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
      metadata: raw.metadata ?? null,
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
  
  const gameStateReceivedRef = useRef<boolean>(false)
  const retryIntervalRef = useRef<number | null>(null)
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

  // Reset view to menu when in stale game view (no game state) - runs on every render cycle
  useEffect(() => {
    if (currentView === "game" && !gameState) {
      console.log("[Pong] Resetting stale game view to menu (no gameState)")
      setCurrentView("menu")
    }
  }, [currentView, gameState, setCurrentView])

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
          
          const newTournament = {
            tournamentId: tournamentFromServer.tournamentId,
            name: tournamentFromServer.name || "Tournament",
            mode: tournamentFromServer.mode || "tournament" as const,
            players: tournamentFromServer.players?.map(mapPlayer) || [],
            matches: tournamentFromServer.matches?.map((m: any) => ({
              matchId: m.matchId,
              round: m.round,
              player1: findPlayer(m.player1Id),
              player2: findPlayer(m.player2Id),
              winner: m.winnerId,
              status: m.status,
              readyPlayers: m.readyPlayers || [],
            })) || [],
            currentRound: tournamentFromServer.currentRound || 1,
            totalRounds: tournamentFromServer.totalRounds || 2,
            status: tournamentFromServer.status || "in_progress" as const,
            winner: findPlayer(tournamentFromServer.winnerId),
            onchainTxHashes: tournamentFromServer.onchainTxHashes || [],
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
        }
        setLobby(null);
        setCurrentView("game");
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

  // Subscribe to game state updates
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];
    
    // Subscribe to getGameState
    unsubscribers.push(subscribe(user_url.ws.pong.getGameState, (message, schema) => {
      // Debug logging disabled for performance
      // console.log("[Pong] Received getGameState:", message.code);
      
      if (message.code === schema.output.GameUpdate.code) {
        const normalized = normalizeGameState(message.payload);
        if (message.payload?.gameOver) {
          console.log("[Pong] 🎮 GAME OVER RECEIVED!", { 
            gameOver: message.payload.gameOver, 
            winner: message.payload.winner,
            score: message.payload.score 
          });
        }
        setGameState(normalized);
        gameStateReceivedRef.current = true;
        if (normalized) {
          setPlayerIDsHelper(normalized);
        }
        // If we received valid game state and we're not in game view, switch to it
        if (currentView !== 'game' && message.payload?.board_id && normalized && !normalized.gameOver) {
          console.log("[Pong] Received game state while not in game view, transitioning to game");
          // Preserve player data for leaderboard before clearing lobby
          if (lobby?.players) {
            // For local 1v1 mode with only 1 player, use WASD and Arrow as names
            if (lobby.gameMode === "1v1" && lobby.players.length === 1) {
              const hostPlayer = lobby.players[0];
              if (hostPlayer) {
                setDebugPlayers([
                  { id: hostPlayer.id, username: "WASD" },
                  { id: -999, username: "Arrow" }
                ]);
              }
            } else {
              // Add human players
              const allPlayers = lobby.players.map(p => ({ id: p.id, username: p.username }));
              // Add AI players if present
              const aiCount = lobby.aiCount || 0;
              for (let i = 0; i < aiCount; i++) {
                const aiId = -1001 - i; // AI IDs are -1001, -1002, etc.
                allPlayers.push({ id: aiId, username: `AI ${i + 1}` });
              }
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
    
    // Subscribe to createLobby
    unsubscribers.push(subscribe(user_url.ws.pong.createLobby, (message, schema) => {
      console.log("[Pong] Received createLobby:", message.code, message.payload);
      
      if (message.code === schema.output.LobbyCreated.code) {
        // Check if we're the host
        const isHost = authResponse && message.payload.players?.some((p: any) =>
          (p.userId === authResponse.user.id || p.id === authResponse.user.id) && p.isHost
        );
        
        console.log("[Pong] isHost check: myId=", authResponse?.user.id, "isHost=", isHost);
        
        if (isHost) {
          // We're the host - go directly to lobby
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
            console.log("[Pong] Tournament lobby created, setting activeTournamentId:", serverTournament.tournamentId);
            setActiveTournamentId(serverTournament.tournamentId);
            
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
              })) || [],
              currentRound: serverTournament.currentRound || 1,
              totalRounds: serverTournament.totalRounds || 2,
              status: serverTournament.status || "in_progress",
              winner: serverTournament.winnerId ? 
                { id: serverTournament.winnerId, username: serverTournament.players?.find((p: any) => (p.userId || p.id) === serverTournament.winnerId)?.username || `Player ${serverTournament.winnerId}` } : null,
            });
          }
          
          setCurrentView("lobby");
        }
        return HandlerResult.Handled;
      }
      
      return HandlerResult.NotHandled;
    }));
    
    // NOTE: togglePlayerReady subscription has been moved to a STABLE useEffect above
    // to prevent missing messages during subscription churn
    
    // Subscribe to startFromLobby
    unsubscribers.push(subscribe(user_url.ws.pong.startFromLobby, (message, schema) => {
      console.log("[Pong] Received startFromLobby:", message.code);
      
      if (message.code === schema.output.GameStarted.code) {
        console.log("[Pong] Game started from lobby! Processing game state");
        const gameStatePayload = message.payload;
        
        // Preserve tournament ID before clearing lobby
        const tournamentIdToPreserve = activeTournamentId || tournament?.tournamentId || (lobby as any)?.tournament?.tournamentId || (lobby as any)?.tournamentId;
        if (tournamentIdToPreserve) {
          console.log("[Pong] Preserving tournament ID:", tournamentIdToPreserve);
          setActiveTournamentId(tournamentIdToPreserve);
        }
        
        console.log("[Pong] Setting game state and transitioning to game view");
        const normalized = normalizeGameState(gameStatePayload);
        if (normalized) {
          setPlayerIDsHelper(normalized);
          setGameState(normalized);
        }
        // Preserve player data for leaderboard before clearing lobby
        if (lobby?.players) {
          // For local 1v1 mode with only 1 player, use WASD and Arrow as names
          if (lobby.gameMode === "1v1" && lobby.players.length === 1) {
            const hostPlayer = lobby.players[0];
            if (hostPlayer) {
              setDebugPlayers([
                { id: hostPlayer.id, username: "WASD" },
                { id: -999, username: "Arrow" }
              ]);
            }
          } else {
            // Add human players
            const allPlayers = lobby.players.map(p => ({ id: p.id, username: p.username }));
            // Add AI players if present
            const aiCount = lobby.aiCount || 0;
            for (let i = 0; i < aiCount; i++) {
              const aiId = -1001 - i; // AI IDs are -1001, -1002, etc.
              allPlayers.push({ id: aiId, username: `AI ${i + 1}` });
            }
            setDebugPlayers(allPlayers);
          }
        }
        setLobby(null);
        setCurrentView("game");
        return HandlerResult.Handled;
      }
      
      return HandlerResult.NotHandled;
    }));

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
        if (result.winnerId === 0 && currentView !== 'game') {
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
  }, [subscribe, authResponse, currentView, activeTournamentId, tournament, lobby, isConnected, sendMessage, setGameState, setLobby, setTournament, setActiveTournamentId, setCurrentView, setLastCreatedBoardId, setPlayerIDsHelper, setDebugPlayers, setTournamentMatchResult]);

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
      if (gameState === null || playerOnePaddleID === -1) return
      if (keysPressed.has(e.key)) return
      keysPressed.add(e.key)

      // Update pressed keys for client-side prediction
      setPressedKeys(Array.from(keysPressed).map(k => k.toLowerCase()))

      if (gameState.board_id === null) return
      const payload: TypeHandleGameKeysSchema = {
        board_id: gameState.board_id,
        pressed_keys: Array.from(keysPressed),
      }
      // console.debug for debugging stuck keys
      // console.debug('[Pong] KeyDown', e.key, payload.pressed_keys)
      handleUserInput(user_url.ws.pong.handleGameKeys, payload)
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (gameState === null || playerOnePaddleID === -1) return
      keysPressed.delete(e.key)

      // Update pressed keys for client-side prediction
      setPressedKeys(Array.from(keysPressed).map(k => k.toLowerCase()))

      const payload = {
        board_id: gameState.board_id,
        pressed_keys: Array.from(keysPressed),
      }
      // console.debug('[Pong] KeyUp', e.key, payload.pressed_keys)
      handleUserInput(user_url.ws.pong.handleGameKeys, payload)
    }

    // Clear pressed keys when window loses focus (fixes stuck keys after alt-tab)
    function handleFocusLost() {
      if (keysPressed.size === 0) return
      keysPressed.clear()
      setPressedKeys([])
      if (gameState?.board_id) {
        handleUserInput(user_url.ws.pong.handleGameKeys, {
          board_id: gameState.board_id,
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
  }, [gameState, handleUserInput, playerOnePaddleID])

  // =========================
  // Keyboard input (O / L)
  // =========================
  useEffect(() => {
    const keysPressed = new Set<string>()
    function handleKeyDown(e: KeyboardEvent) {
      if (gameState === null || playerTwoPaddleID === -1) return
      if (keysPressed.has(e.key)) return
      keysPressed.add(e.key)

      // Update pressed keys for client-side prediction
      setPressedKeys(Array.from(keysPressed).map(k => k.toLowerCase()))

      if (gameState.board_id === null) return
      const payload: TypeHandleGameKeysSchema = {
        board_id: gameState.board_id,
        pressed_keys: Array.from(keysPressed),
      }
      // console.debug('[Pong] KeyDown (player2)', e.key, payload.pressed_keys)
      handleUserInput(user_url.ws.pong.handleGameKeys, payload)
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (gameState === null || playerTwoPaddleID === -1) return
      keysPressed.delete(e.key)

      // Update pressed keys for client-side prediction
      setPressedKeys(Array.from(keysPressed).map(k => k.toLowerCase()))

      const payload = {
        board_id: gameState.board_id,
        pressed_keys: Array.from(keysPressed),
      }
      // console.debug('[Pong] KeyUp (player2)', e.key, payload.pressed_keys)
      handleUserInput(user_url.ws.pong.handleGameKeys, payload)
    }

    // Clear pressed keys when window loses focus (fixes stuck keys after alt-tab)
    function handleFocusLost() {
      if (keysPressed.size === 0) return
      keysPressed.clear()
      setPressedKeys([])
      if (gameState?.board_id) {
        handleUserInput(user_url.ws.pong.handleGameKeys, {
          board_id: gameState.board_id,
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
  }, [gameState, handleUserInput, playerTwoPaddleID])

  // =========================
  // 3D Rendering is handled by BabylonPongRenderer component
  // =========================
  // NOTE: Debug powerup keys (1-7) are handled by the existing W/S and O/L handlers
  // since they pass through ALL pressed keys to the server.


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
          aiCount: settings.aiCount,
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
          aiCount: settings.aiCount,
        },
        target_container: "pong",
      }

      if (isConnected) {
        sendMessage(user_url.ws.pong.createLobby, payload.payload)
        console.log("[Pong] Sent lobby creation to backend:", payload)
      }

      // If it's a tournament, also set up tournament data
      if (mode === "tournament") {
        const newTournament: TournamentData = {
          tournamentId: Date.now(),
          name: "Tournament",
          mode: "tournament",
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
    const tournamentId = tournament?.tournamentId || (lobby as any)?.tournament?.tournamentId || (lobby as any)?.tournamentId
    if (tournamentId) {
      console.log("[Pong] Preserving tournament ID for game start:", tournamentId)
      setActiveTournamentId(tournamentId)
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
      if (!activeTournamentId || !isConnected) {
        console.warn("[Pong] Cannot join match - no active tournament or not connected");
        return;
      }
      console.log("[Pong] Joining tournament match:", matchId, "in tournament:", activeTournamentId);
      sendMessage(user_url.ws.pong.joinTournamentMatch, { 
        tournamentId: activeTournamentId, 
        matchId 
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

  // RENDER LOGIC
  // Debug logging disabled for performance
  // console.log("[Pong] RENDER called, currentView =", currentView);

  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-gray-100/80 dark:bg-dark-600 p-4 space-y-4">
      {/* Pong Invitation Notifications now rendered globally in AppRoot */}

      {/* Main Menu */}
      {currentView === "menu" && (
        <div className="w-full max-w-2xl space-y-4">
          <div className="glass-light-sm dark:glass-dark-sm glass-border shadow-lg p-8 text-center">
            <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-200 mb-4">🏓 {t('pong.title')}</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              {t('pong.subtitle')}
            </p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  resetGameState(); // Clear any stale game state
                  setShowInviteModalLocal(true);
                }}
                className="w-full py-3 bg-blue-500 text-white hover:bg-blue-600 transition-colors font-semibold"
              >
                {t('pong.createGameButton')}
              </button>
              <button
                onClick={() => {
                  // Quick solo play for testing
                  if (authResponse) {
                    alert("About to set view to GAME");
                    const payload: TypeStartNewPongGame = {
                      player_list: [authResponse.user.id],
                      balls: 1,
                      allowPowerups: true,
                    }
                    handleUserInput(user_url.ws.pong.startGame, payload)
                    setCurrentView("game")
                    alert("View set to GAME - click OK");
                  }
                }}
                className="w-full py-3 bg-green-500 text-white hover:bg-green-600 transition-colors font-semibold"
              >
                {t('pong.quickPlay')}
              </button>
              <button
                onClick={() => {
                  // Debug: 8-player game with multiple balls
                  if (authResponse) {
                    // Use offsets that give different colors (modulo 8)
                    const baseId = authResponse.user.id
                    const playerIds = [
                      baseId,
                      baseId + 1,
                      baseId + 2,
                      baseId + 3,
                      baseId + 4,
                      baseId + 5,
                      baseId + 6,
                      baseId + 7,
                    ]
                    const debugPlayerNames = [
                      'Player 1', 'Player 2', 'Player 3', 'Player 4',
                      'Player 5', 'Player 6', 'Player 7', 'Player 8'
                    ]
                    // Set debug players for leaderboard
                    setDebugPlayers(playerIds.map((id, i) => ({ id, username: debugPlayerNames[i] || `Player ${i + 1}` })))
                    const payload: TypeStartNewPongGame = {
                      player_list: playerIds,
                      balls: 3,
                      allowPowerups: true,
                    }
                    handleUserInput(user_url.ws.pong.startGame, payload)
                    setCurrentView("game")
                  }
                }}
                className="w-full py-3 bg-purple-500 text-white hover:bg-purple-600 transition-colors font-semibold"
              >
                {t('pong.debugMode')}
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
            onSpectate={handleSpectate}
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
                if (lobbyRef.current && isConnected) {
                  sendMessage(user_url.ws.pong.leaveLobby, { lobbyId: lobbyRef.current.lobbyId })
                }
                setLobby(null);
                setTournament(null);
                setGameState(null);
                setCurrentView("menu");
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
                gameMode={lobby?.gameMode ?? null}
                paddleRotationOffset={paddleRotationOffset}
              />
            )}
            {/* Leaderboard Overlay */}
            {gameState && (lobby || debugPlayers) && (
              <PongLeaderboard
                players={(() => {
                  // Only show players who are actually playing in this game (have a paddle)
                  const activePaddleOwnerIds = new Set(gameState.paddles.map(p => p.owner_id));
                  const allPlayers = lobby ? lobby.players.map(p => ({ id: p.id, username: p.username })) : (debugPlayers || []);
                  return allPlayers.filter(p => activePaddleOwnerIds.has(p.id));
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
                  </>
                ) : (
                  <>
                    <h1 className="text-yellow-400 text-6xl mb-5 drop-shadow-lg">{t('pong.gameOverText')}</h1>
                    <p className="text-white text-3xl mb-8">{t('pong.winner')}: <span className="text-green-500 font-bold">{
                      (() => {
                        const winnerId = gameState.winner;
                        const players = debugPlayers || tournament?.players?.map(p => ({ id: p.id, username: p.alias || p.username })) || lobby?.players?.map(p => ({ id: p.id, username: p.username })) || [];
                        const winner = players.find(p => p.id === winnerId);
                        return winner?.username || `${t('pong.player')} ${winnerId}`;
                      })()
                    }</span></p>
                  </>
                )}
                
                {/* Score display */}
                <p className="text-gray-400 text-2xl mb-8">
                  {gameState.score
                    ? Object.entries(gameState.score).map(([p, s]: [string, any]) => {
                        const playerId = parseInt(p);
                        const players = debugPlayers || tournament?.players?.map(pl => ({ id: pl.id, username: pl.alias || pl.username })) || lobby?.players?.map(pl => ({ id: pl.id, username: pl.username })) || [];
                        const player = players.find(pl => pl.id === playerId);
                        const name = player?.username || `${t('pong.player')} ${p}`;
                        return `${name}: ${s}`;
                      }).join(' | ')
                    : ''}
                </p>

                {/* Tournament-specific messaging */}
                {activeTournamentId && (() => {
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
                        <p className="text-red-400 text-lg">{t('pong.eliminatedFromTournament')}</p>
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
                  {/* Tournament: Show "Next Match" button if winner and tournament not complete */}
                  {(() => {
                    // Check if I won my most recent match in this tournament
                    const myCompletedMatch = tournament?.matches.find(m =>
                      m.status === 'completed' &&
                      m.winner === myUserId
                    );
                    
                    const isTournamentComplete = tournament?.status === 'completed';
                    
                    // Show continue if: I'm in a tournament, I won my match, tournament isn't complete
                    const showContinue = activeTournamentId && myCompletedMatch && !isTournamentComplete;
                    
                    console.log('[GameOver] Button logic:', {
                      activeTournamentId,
                      myUserId,
                      myCompletedMatch: myCompletedMatch ? { matchId: myCompletedMatch.matchId, winner: myCompletedMatch.winner } : null,
                      isTournamentComplete,
                      showContinue,
                    });
                    
                    if (showContinue) {
                      return (
                        <button
                          onClick={() => {
                            console.log("[Pong] Continuing to tournament bracket");
                            setTournamentMatchResult(null);
                            setGameState(null);
                            setCurrentView("tournament");
                          }}
                          className="px-12 py-4 text-xl bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-600 transition-all"
                        >
                          {t('pong.continueToNextMatch')}
                        </button>
                      );
                    }
                    return null;
                  })()}

                  {/* Tournament: Show "View Tournament" button to see bracket */}
                  {activeTournamentId && tournament && (
                    <button
                      onClick={() => {
                        console.log("[Pong] Viewing tournament bracket");
                        setTournamentMatchResult(null);
                        setGameState(null);
                        setCurrentView("tournament");
                      }}
                      className="px-12 py-4 text-xl bg-purple-500 text-white rounded-xl font-bold hover:bg-purple-600 transition-all"
                    >
                      {t('pong.viewTournament')}
                    </button>
                  )}

                  {/* Always show "Back to Menu" option */}
                  <button
                    onClick={() => {
                      console.log("[Pong] Game over back button clicked");
                      if (lobbyRef.current && isConnected) {
                        sendMessage(user_url.ws.pong.leaveLobby, { lobbyId: lobbyRef.current.lobbyId })
                      }
                      setLobby(null);
                      setTournament(null);
                      setTournamentMatchResult(null);
                      setGameState(null);
                      setActiveTournamentId(null);
                      if (onNavigateToChatRef.current) {
                        onNavigateToChatRef.current();
                      } else {
                        setCurrentView("menu");
                      }
                    }}
                    className={`px-12 py-4 text-xl ${activeTournamentId ? 'bg-gray-600 hover:bg-gray-700' : 'bg-green-500 hover:bg-green-600'} text-white rounded-xl font-bold transition-all`}
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
