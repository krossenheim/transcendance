import { create } from 'zustand';
import type { TypeGameStateSchema } from '../types/pong-interfaces';
import type { PongLobbyData } from '../pongLobby';
import type { TournamentData } from '../tournamentBracket';

export type PongView = "menu" | "lobby" | "game" | "tournament";

interface PongState {
    // Core game state
    gameState: TypeGameStateSchema | null;
    playerOnePaddleID: number;
    playerTwoPaddleID: number;
    lastCreatedBoardId: number | null;
    pressedKeys: string[];

    // View and UI state
    currentView: PongView;

    // Lobby state
    lobby: PongLobbyData | null;

    // Debug players (for debug mode when no lobby exists)
    debugPlayers: Array<{ id: number; username: string }> | null;

    // Tournament state
    tournament: TournamentData | null;
    activeTournamentId: number | null;
    showTournamentStats: boolean;

    // Modals
    showInviteModalLocal: boolean;
    inviteRoomUsers: Array<{ id: number; username: string; onlineStatus?: number }>;

    // Actions - Game state
    setGameState: (state: TypeGameStateSchema | null) => void;
    setPlayerOnePaddleID: (id: number) => void;
    setPlayerTwoPaddleID: (id: number) => void;
    setLastCreatedBoardId: (id: number | null) => void;
    setPressedKeys: (keys: string[]) => void;

    // Actions - View
    setCurrentView: (view: PongView) => void;

    // Actions - Lobby
    setLobby: (lobby: PongLobbyData | null) => void;
    updateLobbyFromPayload: (payload: any, authUserId?: number) => void;
    setDebugPlayers: (players: Array<{ id: number; username: string }> | null) => void;

    // Actions - Tournament
    setTournament: (tournament: TournamentData | null) => void;
    setActiveTournamentId: (id: number | null) => void;
    setShowTournamentStats: (show: boolean) => void;
    updateTournamentPlayerAlias: (userId: number, alias: string) => void;

    // Actions - Modals
    setShowInviteModalLocal: (show: boolean) => void;
    setInviteRoomUsers: (users: Array<{ id: number; username: string; onlineStatus?: number }>) => void;

    // Actions - Compound
    resetGameState: () => void;
    handleGameOver: () => void;
}

export const usePongStore = create<PongState>((set, get) => ({
    // Initial state
    gameState: null,
    playerOnePaddleID: -1,
    playerTwoPaddleID: -2,
    lastCreatedBoardId: null,
    pressedKeys: [],
    currentView: "menu",
    lobby: null,
    tournament: null,
    activeTournamentId: null,
    showTournamentStats: false,
    showInviteModalLocal: false,
    inviteRoomUsers: [],
    debugPlayers: null,

    // Actions - Game state
    setGameState: (gameState) => {
        set({ gameState });
        // Expose to window for debugging
        try { (window as any).__lastNormalizedPongState = gameState } catch (e) { /* ignore */ }
    },

    setPlayerOnePaddleID: (playerOnePaddleID) => set({ playerOnePaddleID }),
    setPlayerTwoPaddleID: (playerTwoPaddleID) => set({ playerTwoPaddleID }),
    setLastCreatedBoardId: (lastCreatedBoardId) => set({ lastCreatedBoardId }),
    setPressedKeys: (pressedKeys) => set({ pressedKeys }),

    // Actions - View
    setCurrentView: (currentView) => {
        console.log("[PongStore] VIEW CHANGE:", get().currentView, "->", currentView);
        set({ currentView });
    },

    // Actions - Lobby
    setLobby: (lobby) => set({ lobby }),
    setDebugPlayers: (debugPlayers) => set({ debugPlayers }),

    updateLobbyFromPayload: (payload, authUserId) => {
        const lobbyData = payload;

        // Check if user is in this lobby
        const isInLobby = !authUserId || lobbyData.players.some((p: any) =>
            p.userId === authUserId || p.id === authUserId
        );

        if (!isInLobby) return;

        const newLobby: PongLobbyData = {
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
            },
            status: lobbyData.status,
        };

        set({ lobby: newLobby });

        // If we're in menu view and receive lobby update, switch to lobby
        if (get().currentView === "menu") {
            set({ currentView: "lobby" });
        }
    },

    // Actions - Tournament
    setTournament: (tournament) => set({ tournament }),
    setActiveTournamentId: (activeTournamentId) => set({ activeTournamentId }),
    setShowTournamentStats: (showTournamentStats) => set({ showTournamentStats }),

    updateTournamentPlayerAlias: (userId, alias) => {
        const tournament = get().tournament;
        if (!tournament) return;

        set({
            tournament: {
                ...tournament,
                players: tournament.players.map((p) =>
                    p.id === userId ? { ...p, alias } : p
                ),
            },
        });
    },

    // Actions - Modals
    setShowInviteModalLocal: (showInviteModalLocal) => set({ showInviteModalLocal }),
    setInviteRoomUsers: (inviteRoomUsers) => set({ inviteRoomUsers }),

    // Actions - Compound
    resetGameState: () => set({
        gameState: null,
        lobby: null,
        tournament: null,
        debugPlayers: null,
        playerOnePaddleID: -1,
        playerTwoPaddleID: -2,
        currentView: "menu",
    }),

    handleGameOver: () => {
        // Called when game ends - can be used to transition back
        console.log("[PongStore] Game over handled");
    },
}));
