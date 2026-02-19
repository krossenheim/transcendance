import { type LobbyDataType, LobbyStatus, PlayerLobbyStatus } from "@app/shared/api/service/pong/lobby_interfaces";
import { Result } from "@app/shared/api/service/common/result";
// import type { Statement } from "better-sqlite3";
import Database from "./database";

export class LobbyService {
	private db: Database;

	// private createLobbyStmt: Statement | null = null;
	// private setUserLobbyStateStmt: Statement | null = null;
	// private getLobbyByIdStmt: Statement | null = null;

	constructor(db: Database) {
		this.db = db;
	}

	setUserLobbyState(lobbyId: number, userId: number, state: PlayerLobbyStatus): Result<void, string> {
		return this.db.run(
			`INSERT INTO lobby_players (lobbyId, userId, playerState) VALUES (?, ?, ?)
			 ON CONFLICT(lobbyId, userId) DO UPDATE SET playerState = excluded.playerState`,
			[lobbyId, userId, state]
		).map(() => undefined).mapErr(err => err.message);
	}

	createLobby(hostUserId: number): Result<LobbyDataType, string> {
		const result = this.db.run(
			`INSERT INTO game_lobbies (hostUserId, lobbyState) VALUES (?, ?)`,
			[hostUserId, LobbyStatus.WaitingForPlayers]
		);

		if (result.isErr())
			return Result.Err(result.unwrapErr().message);

		const lobbyId = Number(result.unwrap().lastInsertRowid);
		if (this.setUserLobbyState(lobbyId, hostUserId, PlayerLobbyStatus.Joined).isErr())
			return Result.Err("Failed to set user lobby state");

		return this.getLobbyById(lobbyId);
	}

	getLobbyById(lobbyId: number): Result<LobbyDataType, string> {
		const result = this.db.prepare(
			`SELECT 
				game_lobbies.lobbyId,
				game_lobbies.hostUserId,
				game_lobbies.lobbyState,
				game_lobbies.lobbyGameId,
				(
					SELECT json_group_array(
						json_array(lobby_players.userId, users.username, lobby_players.playerState)
					)
					FROM lobby_players
					INNER JOIN users ON lobby_players.userId = users.id
					WHERE lobby_players.lobbyId = game_lobbies.lobbyId
				) as players,
				(
					SELECT json_group_object(lobby_settings.settingKey, lobby_settings.settingValue)
					FROM lobby_settings
					WHERE lobby_settings.lobbyId = game_lobbies.lobbyId
				) as settings
			FROM game_lobbies
			WHERE game_lobbies.lobbyId = ?`
		).get(lobbyId);

		console.log("Fetched lobby data:", result);

		return Result.Err("Some error");
	}
}