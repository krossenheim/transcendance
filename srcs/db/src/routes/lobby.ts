import { registerRoute } from "@app/shared/api/service/common/fastify";
import { int_url } from "@app/shared/api/service/common/endpoints";
import { lobbyService } from "../main";

export async function lobbyRoutes(fastify: any) {
	registerRoute(fastify, int_url.http.pong.createLobby, async (request, reply) => {
		const createRoomResult = lobbyService.createLobby(request.params.hostId);
		if (createRoomResult.isErr())
			return reply.status(500).send({ message: createRoomResult.unwrapErr() });
		else return reply.status(201).send(createRoomResult.unwrap());
	});
};

export default lobbyRoutes;
