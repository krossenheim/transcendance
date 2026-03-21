import { type LobbyDataType, LobbyStatus, PlayerLobbyStatus, LobbyDataSchema } from "@app/shared/api/service/pong/lobby_interfaces";
import { Result } from "@app/shared/api/service/common/result";
import Database, { DatabaseError } from "./database";
import { RunResult } from "better-sqlite3";

export class LobbyService {
	private db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	private _dbGetLobbyById(lobbyId: number): Result<LobbyDataType, DatabaseError> {
		return this.db.get(
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
			WHERE game_lobbies.lobbyId = ?`,
			LobbyDataSchema,
			[lobbyId]
		);
	}

	private _dbSetOrUpdateUserLobbyState(lobbyId: number, userId: number, state: PlayerLobbyStatus): Result<RunResult, DatabaseError> {
		return this.db.run(
			`INSERT INTO lobby_players (lobbyId, userId, playerState) VALUES (?, ?, ?)
			 ON CONFLICT(lobbyId, userId) DO UPDATE SET playerState = excluded.playerState`,
			[lobbyId, userId, state]
		);
	}

	private _dbCreateNewLobby(hostUserId: number): Result<number, DatabaseError> {
		return this.db.run(
			`INSERT INTO game_lobbies (hostUserId, lobbyState) VALUES (?, ?)`,
			[hostUserId, LobbyStatus.WaitingForPlayers]
		).map(result => Number(result.lastInsertRowid));
	}

	private _dbCreateNewLobbyWithId(lobbyId: number, hostUserId: number): Result<number, DatabaseError> {
		return this.db.run(
			`INSERT INTO game_lobbies (lobbyId, hostUserId, lobbyState) VALUES (?, ?, ?)`,
			[lobbyId, hostUserId, LobbyStatus.WaitingForPlayers]
		).map(result => Number(result.lastInsertRowid));
	}

	private _dbDeleteLobby(lobbyId: number): Result<RunResult, DatabaseError> {
		return this.db.run(
			`DELETE FROM game_lobbies WHERE lobbyId = ?`,
			[lobbyId]
		);
	}

	private _dbUpdateLobbyState(lobbyId: number, state: LobbyStatus): Result<RunResult, DatabaseError> {
		return this.db.run(
			`UPDATE game_lobbies SET lobbyState = ? WHERE lobbyId = ?`,
			[state, lobbyId]
		);
	}

	private _dbSaveLobbySettings(lobbyId: number, settings: Record<string, string>): Result<void, DatabaseError> {
		for (const [key, value] of Object.entries(settings)) {
			const result = this.db.run(
				`INSERT INTO lobby_settings (lobbyId, settingKey, settingValue) VALUES (?, ?, ?)
				 ON CONFLICT(lobbyId, settingKey) DO UPDATE SET settingValue = excluded.settingValue`,
				[lobbyId, key, value]
			);
			if (result.isErr()) return Result.Err(result.unwrapErr());
		}
		return Result.Ok(undefined);
	}

	public setUserLobbyState(lobbyId: number, userId: number, state: PlayerLobbyStatus): Result<RunResult, DatabaseError> {
		return this._dbSetOrUpdateUserLobbyState(lobbyId, userId, state);
	}

	public createLobby(hostUserId: number): Result<LobbyDataType, DatabaseError> {
		return this.db.transaction(() => {
			const lobbyId = this._dbCreateNewLobby(hostUserId).unwrap();
			this._dbSetOrUpdateUserLobbyState(lobbyId, hostUserId, PlayerLobbyStatus.Joined).unwrap();
			return this._dbGetLobbyById(lobbyId);
		});
	}

	public createLobbyFull(
		lobbyId: number,
		hostUserId: number,
		players: { userId: number; state: number }[],
		settings: Record<string, string>
	): Result<void, DatabaseError> {
		return this.db.transaction(() => {
			this._dbCreateNewLobbyWithId(lobbyId, hostUserId).unwrap();
			for (const player of players) {
				this._dbSetOrUpdateUserLobbyState(lobbyId, player.userId, player.state as PlayerLobbyStatus).unwrap();
			}
			this._dbSaveLobbySettings(lobbyId, settings).unwrap();
			return Result.Ok(undefined);
		});
	}

	public getLobbyById(lobbyId: number): Result<LobbyDataType, DatabaseError> {
		return this._dbGetLobbyById(lobbyId);
	}

	public deleteLobby(lobbyId: number): Result<RunResult, DatabaseError> {
		return this._dbDeleteLobby(lobbyId);
	}

	public updateLobbyState(lobbyId: number, state: LobbyStatus): Result<RunResult, DatabaseError> {
		return this._dbUpdateLobbyState(lobbyId, state);
	}
}
