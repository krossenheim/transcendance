import type { Result } from "@app/shared/api/service/common/result";
import { Result as ResultClass } from "@app/shared/api/service/common/result";
import type { ErrorResponseType } from "@app/shared/api/service/common/error";
import { LobbyDataSchema } from "@app/shared/api/service/pong/pong_interfaces";
// import type { LobbyDataType } from "@app/shared/api/service/pong/pong_interfaces";

// class Lobby {
//   private lobbyData: LobbyDataType;

//   constructor(lobbyData: LobbyDataType) {
//     this.lobbyData = lobbyData;
//   }

//   static async buildNewLobby(hostUserId: number): Promise<Result<Lobby, string>> {
    

    
//   }


// }


// export interface LobbyPlayer {
//   userId: number;
//   username: string;
//   isReady: boolean;
//   isHost: boolean;
// }
import { z } from "zod";

// export interface Lobby {
//   lobbyId: number;
//   gameMode: "1v1" | "multiplayer" | "tournament" | "lastOneStanding";
//   players: LobbyPlayer[];
//   ballCount: number;
//   maxScore: number;
//   allowPowerups: boolean;
//   aiCount: number;
//   aiDifficulty: number;
//   status: "waiting" | "starting" | "in_progress";
//   gameId?: number;
//   tournamentId?: number;
// }
export type Lobby = z.infer<typeof LobbyDataSchema>;

export class LobbyManager {
  private lobbies: Map<number, Lobby>;
  private playerToLobby: Map<number, number>; // userId -> lobbyId
  private nextLobbyId: number;

  constructor() {
    this.lobbies = new Map();
    this.playerToLobby = new Map();
    this.nextLobbyId = 1;
  }

  createLobby(
    gameMode: "1v1" | "multiplayer" | "tournament" | "lastOneStanding",
    playerIds: number[],
    playerUsernames: { [key: number]: string },
    ballCount: number,
    maxScore: number,
    allowPowerups: boolean = false,
    aiCount: number = 0,
    aiDifficulty: number = 3
  ): Result<Lobby, ErrorResponseType> {
    if (playerIds.length < 1) {
      return ResultClass.Err({ message: "Lobby requires at least 1 player" });
    }

    // Auto-remove players from existing lobbies before creating the new one
    for (const playerId of playerIds) {
      const existingLobbyId = this.playerToLobby.get(playerId);
      if (existingLobbyId !== undefined) {
        this.removePlayerFromLobby(existingLobbyId, playerId);
      }
    }

    const hostId = playerIds[0];
    const lobby: Lobby = {
      lobbyId: this.nextLobbyId++,
      gameMode,
      players: playerIds.map((userId) => ({
        userId,
        username: playerUsernames[userId] || `Player ${userId}`,
        isReady: false,
        isHost: userId === hostId,
      })),
      ballCount,
      maxScore,
      allowPowerups,
      aiCount: Math.min(7, Math.max(0, aiCount)), // Clamp between 0-7
      aiDifficulty: Math.min(3, Math.max(1, aiDifficulty)),
      status: "waiting",
    };

    this.lobbies.set(lobby.lobbyId, lobby);
    playerIds.forEach((playerId) => {
      this.playerToLobby.set(playerId, lobby.lobbyId);
    });

    return ResultClass.Ok(lobby);
  }

  togglePlayerReady(
    lobbyId: number,
    userId: number
  ): Result<Lobby, ErrorResponseType> {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return ResultClass.Err({ message: "Lobby not found" });
    }

    const player = lobby.players.find((p) => p.userId === userId);
    if (!player) {
      return ResultClass.Err({ message: "Player not in lobby" });
    }

    player.isReady = !player.isReady;

    return ResultClass.Ok(lobby);
  }

  canStartGame(lobbyId: number): Result<boolean, ErrorResponseType> {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return ResultClass.Err({ message: "Lobby not found" });
    }

    const allReady = lobby.players.every((p) => p.isReady);
    // 1v1 local mode allows just 1 player (second is local guest on same keyboard)
    const minPlayers = lobby.gameMode === "1v1" ? 1 : 2;
    // Total players includes humans + AI
    const totalPlayers = lobby.players.length + (lobby.aiCount || 0);

    return ResultClass.Ok(allReady && totalPlayers >= minPlayers);
  }

  startGame(
    lobbyId: number,
    userId: number,
    gameId: number
  ): Result<Lobby, ErrorResponseType> {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return ResultClass.Err({ message: "Lobby not found" });
    }

    const player = lobby.players.find((p) => p.userId === userId);
    if (!player || !player.isHost) {
      return ResultClass.Err({ message: "Only the host can start the game" });
    }

    const canStart = this.canStartGame(lobbyId);
    if (canStart.isErr()) {
      return ResultClass.Err(canStart.unwrapErr());
    }

    if (!canStart.unwrap()) {
      return ResultClass.Err({ message: "Not all players are ready" });
    }

    lobby.status = "in_progress";
    lobby.gameId = gameId;

    return ResultClass.Ok(lobby);
  }

  setTournamentId(lobbyId: number, tournamentId: number): Result<Lobby, ErrorResponseType> {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return ResultClass.Err({ message: "Lobby not found" });
    }

    lobby.tournamentId = tournamentId;
    return ResultClass.Ok(lobby);
  }

  getLobby(lobbyId: number): Lobby | undefined {
    return this.lobbies.get(lobbyId);
  }

  getLobbyForPlayer(userId: number): Lobby | undefined {
    const lobbyId = this.playerToLobby.get(userId);
    if (!lobbyId) return undefined;
    return this.lobbies.get(lobbyId);
  }

  removeLobby(lobbyId: number): void {
    const lobby = this.lobbies.get(lobbyId);
    if (lobby) {
      // Remove player mappings
      lobby.players.forEach((p) => {
        this.playerToLobby.delete(p.userId);
      });
      this.lobbies.delete(lobbyId);
    }
  }

  removePlayerFromLobby(lobbyId: number, userId: number): Result<Lobby | null, ErrorResponseType> {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return ResultClass.Err({ message: "Lobby not found" });
    }

    lobby.players = lobby.players.filter((p) => p.userId !== userId);
    this.playerToLobby.delete(userId);

    // If lobby is empty, delete it
    if (lobby.players.length === 0) {
      this.lobbies.delete(lobbyId);
      return ResultClass.Ok(null);
    }

    // If host left, assign new host
    if (!lobby.players.some((p) => p.isHost) && lobby.players.length > 0) {
      const firstPlayer = lobby.players[0];
      if (firstPlayer) {
        firstPlayer.isHost = true;
      }
    }

    return ResultClass.Ok(lobby);
  }
}

export default LobbyManager;
