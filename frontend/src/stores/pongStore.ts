import { create } from 'zustand';
import type { TypeGameStateSchema } from '../types/pong-interfaces';
import type { PongLobbyData } from '../pongLobby';
import type { TournamentData, TournamentMatch } from '../tournamentBracket';

export type PongView = "menu" | "lobby" | "game" | "tournament";

export interface TournamentMatchResultInfo {
    tournamentId: number;
    matchId: number;
    winnerId: number | null;
    loserId: number | null;
    nextMatch: TournamentMatch | null;
    isTournamentComplete: boolean;
}

interface PongState {
    gameState: TypeGameStateSchema | null;
    playerOnePaddleID: number;
    playerTwoPaddleID: number;
    lastCreatedBoardId: number | null;
    pressedKeys: string[];

    currentView: PongView;

    lobby: PongLobbyData | null;

    debugPlayers: Array<{ id: number; username: string }> | null;

    tournament: TournamentData | null;
    activeTournamentId: number | null;
    showTournamentStats: boolean;
    tournamentMatchResult: TournamentMatchResultInfo | null;

    showInviteModalLocal: boolean;
    inviteRoomUsers: Array<{ id: number; username: string; onlineStatus?: number }>;

    setGameState: (state: TypeGameStateSchema | null) => void;
    setPlayerOnePaddleID: (id: number) => void;
    setPlayerTwoPaddleID: (id: number) => void;
    setLastCreatedBoardId: (id: number | null) => void;
    setPressedKeys: (keys: string[]) => void;

    setCurrentView: (view: PongView) => void;

    setLobby: (lobby: PongLobbyData | null) => void;
    updateLobbyFromPayload: (payload: any, authUserId?: number) => void;
    setDebugPlayers: (players: Array<{ id: number; username: string }> | null) => void;

    setTournament: (tournament: TournamentData | null) => void;
    setActiveTournamentId: (id: number | null) => void;
    setShowTournamentStats: (show: boolean) => void;
    updateTournamentPlayerAlias: (userId: number, alias: string) => void;
    setTournamentMatchResult: (result: TournamentMatchResultInfo | null) => void;

    setShowInviteModalLocal: (show: boolean) => void;
    setInviteRoomUsers: (users: Array<{ id: number; username: string; onlineStatus?: number }>) => void;

    resetGameState: () => void;
    handleGameOver: () => void;
}

export const usePongStore = create<PongState>((set, get) => ({
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
    tournamentMatchResult: null,
    showInviteModalLocal: false,
    inviteRoomUsers: [],
    debugPlayers: null,

    setGameState: (gameState) => {
        set({ gameState });
        try { (window as any).__lastNormalizedPongState = gameState } catch (e) {  }
    },

    setPlayerOnePaddleID: (playerOnePaddleID) => set({ playerOnePaddleID }),
    setPlayerTwoPaddleID: (playerTwoPaddleID) => set({ playerTwoPaddleID }),
    setLastCreatedBoardId: (lastCreatedBoardId) => set({ lastCreatedBoardId }),
    setPressedKeys: (pressedKeys) => set({ pressedKeys }),

    setCurrentView: (currentView) => {
        console.log("[PongStore] VIEW CHANGE:", get().currentView, "->", currentView);
        set({ currentView });
    },

    setLobby: (lobby) => set({ lobby }),
    setDebugPlayers: (debugPlayers) => set({ debugPlayers }),

    updateLobbyFromPayload: (payload, authUserId) => {
        const lobbyData = payload;

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

        if (get().currentView === "menu") {
            set({ currentView: "lobby" });
        }
    },

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

    setTournamentMatchResult: (tournamentMatchResult) => {
        console.log("[PongStore] Setting tournament match result:", tournamentMatchResult);
        set({ tournamentMatchResult });
    },

    setShowInviteModalLocal: (showInviteModalLocal) => set({ showInviteModalLocal }),
    setInviteRoomUsers: (inviteRoomUsers) => set({ inviteRoomUsers }),

    resetGameState: () => set({
        gameState: null,
        lobby: null,
        tournament: null,
        tournamentMatchResult: null,
        debugPlayers: null,
        playerOnePaddleID: -1,
        playerTwoPaddleID: -2,
        lastCreatedBoardId: null,
        pressedKeys: [],
        activeTournamentId: null,
        currentView: "menu",
    }),

    handleGameOver: () => {
        console.log("[PongStore] Game over handled");
    },
}));

