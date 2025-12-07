import type { Result } from "@app/shared/api/service/common/result";
import { Result as ResultClass } from "@app/shared/api/service/common/result";
import type { ErrorResponseType } from "@app/shared/api/service/common/error";

export interface LobbyPlayer {
  userId: number;
  username: string;
  isReady: boolean;
  isHost: boolean;
}

export interface Lobby {
  lobbyId: number;
  gameMode: "1v1" | "multiplayer" | "tournament_1v1" | "tournament_multi";
  players: LobbyPlayer[];
  ballCount: number;
  maxScore: number;
  allowPowerups: boolean;
  status: "waiting" | "starting" | "in_progress";
  gameId?: number; // Set when game starts
  tournamentId?: number; // Set if this is a tournament
}

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
    gameMode: "1v1" | "multiplayer" | "tournament_1v1" | "tournament_multi",
    playerIds: number[],
    playerUsernames: { [key: number]: string },
    ballCount: number,
    maxScore: number,
    allowPowerups: boolean = false
  ): Result<Lobby, ErrorResponseType> {
    if (playerIds.length < 1) {
      return ResultClass.Err({ message: "Lobby requires at least 1 player" });
    }

    // Check if any players are already in a lobby
    for (const playerId of playerIds) {
      if (this.playerToLobby.has(playerId)) {
        return ResultClass.Err({
          message: `Player ${playerId} is already in a lobby`,
        });
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
    const minPlayers = lobby.gameMode === "1v1" ? 2 : 2;

    return ResultClass.Ok(allReady && lobby.players.length >= minPlayers);
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
