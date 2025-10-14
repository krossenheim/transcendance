import { registerRoute } from "../utils/api/service/common/fastify.js";
import { int_url } from "../utils/api/service/common/endpoints.js";
import { chatService } from "../main.js";

import type { FastifyInstance } from "fastify";

export async function chatRoutes(fastify: FastifyInstance) {
    registerRoute(fastify, int_url.http.db.createChatRoom, async (request, reply) => {
        const creationResult = chatService.createNewRoom(request.body.roomName);
        if (creationResult.isErr())
            return reply.status(500).send({ message: creationResult.unwrapErr() });
        else return reply.status(201).send(creationResult.unwrap());
    });

    registerRoute(fastify, int_url.http.db.getRoomMessages, async (request, reply) => {
        // const messages :
        // const tokenResult = tokenService.fetchUserIdFromToken(hashedToken);
        // if (tokenResult.isErr())
        // 	return reply.status(401).send({ message: tokenResult.unwrapErr() });
        // const userResult = userService.fetchUserById(tokenResult.unwrap());
        // if (userResult.isErr())
        // 	return reply.status(500).send({ message: userResult.unwrapErr() });
        // return reply.status(200).send(userResult.unwrap());
    });
}

export default chatRoutes;
