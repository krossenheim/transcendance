import { registerRoute } from "@app/shared/api/service/common/fastify";
import { int_url } from "@app/shared/api/service/common/endpoints";
import { lobbyService } from "../main";
import { PlayerLobbyStatus, LobbyStatus } from "@app/shared/api/service/pong/lobby_interfaces";

export async function lobbyRoutes(fastify: any) {
	registerRoute(fastify, int_url.http.pong.createLobby, async (request, reply) => {
		const createRoomResult = lobbyService.createLobby(request.params.hostId);
		if (createRoomResult.isErr())
			return reply.status(500).send({ message: createRoomResult.unwrapErr().message });
		else return reply.status(201).send(createRoomResult.unwrap());
	});

	registerRoute(fastify, int_url.http.db.createLobbyFull, async (request, reply) => {
		const { lobbyId, hostUserId, players, settings } = request.body;
		const result = lobbyService.createLobbyFull(lobbyId, hostUserId, players, settings);
		if (result.isErr()) {
			console.error("[DB] createLobbyFull error:", result.unwrapErr().message);
			return reply.status(500).send({ message: result.unwrapErr().message });
		}
		return reply.status(201).send(null);
	});

	registerRoute(fastify, int_url.http.db.setLobbyPlayerState, async (request, reply) => {
		const { lobbyId, userId, state } = request.body;
		const result = lobbyService.setUserLobbyState(lobbyId, userId, state as PlayerLobbyStatus);
		if (result.isErr()) {
			console.error("[DB] setLobbyPlayerState error:", result.unwrapErr().message);
			return reply.status(500).send({ message: result.unwrapErr().message });
		}
		return reply.status(200).send(null);
	});

	registerRoute(fastify, int_url.http.db.updateLobbyState, async (request, reply) => {
		const { lobbyId, state } = request.body;
		const result = lobbyService.updateLobbyState(lobbyId, state as LobbyStatus);
		if (result.isErr()) {
			console.error("[DB] updateLobbyState error:", result.unwrapErr().message);
			return reply.status(500).send({ message: result.unwrapErr().message });
		}
		return reply.status(200).send(null);
	});

	registerRoute(fastify, int_url.http.db.deleteLobbyFromDb, async (request, reply) => {
		const { lobbyId } = request.body;
		const result = lobbyService.deleteLobby(lobbyId);
		if (result.isErr()) {
			console.error("[DB] deleteLobby error:", result.unwrapErr().message);
			return reply.status(500).send({ message: result.unwrapErr().message });
		}
		return reply.status(200).send(null);
	});
};

export default lobbyRoutes;
