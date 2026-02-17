import { userIdValue } from "@app/shared/api/service/common/zodRules";
import { z } from "zod";

export enum GameMode {
	Multiplayer = "multiplayer",
	Tournament = "tournament",
}

export enum LobbyStatus {
	WaitingForPlayers = 0,
	GameStarting = 1,
	GameInProgress = 2,
	GameEnded = 3,
}

export enum PlayerLobbyStatus {
	Invited = 0,
	Joined = 1,
	Ready = 2,
	Left = 3,
	Declined = 4,
	Disconnected = 5,
}

export const LobbySettingsSchema = z.object({
	gameMode: z.enum(GameMode).optional(),
}).strict();

export const LobbyDataSchema = z.object({
	lobbyId: z.number().int().min(1),
	hostUserId: userIdValue,
	lobbySettings: LobbySettingsSchema,
	lobbyState: z.enum(LobbyStatus),
	lobbyGameId: z.number().int().min(1).optional(),
	players: z.array(z.tuple([userIdValue, z.string(), z.enum(PlayerLobbyStatus)])),
}).strict();

export type LobbyDataType = z.infer<typeof LobbyDataSchema>;
