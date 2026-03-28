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

export function StringToJSON<T extends z.ZodType<any>>(schema: T) {
	return z.preprocess((val) => {
		if (typeof val === "string") {
			try {
				return JSON.parse(val);
			} catch (e) {
				return val;
			}
		}
		return val;
	}, schema);
}

export const LobbySettingsSchema = z.object({
	gameMode: z.enum(GameMode).optional(),
}).strict();

export const LobbyDataSchema = z.object({
	lobbyId: z.number().int().min(1),
	hostUserId: userIdValue,
	lobbyState: z.enum(LobbyStatus),
	players: StringToJSON(z.array(z.tuple([userIdValue, z.string(), z.enum(PlayerLobbyStatus)]))),
	settings: StringToJSON(LobbySettingsSchema),
}).strict();

export type LobbyDataType = z.infer<typeof LobbyDataSchema>;
