import { registerRoute } from "./utils/api/service/common/fastify.js";
import { int_url } from "./utils/api/service/common/endpoints.js";
import ChatRooms from "./roomClass.js";
import type { FastifyInstance } from "fastify";

export async function chatEndpoints(fastify: FastifyInstance, singletonChatRooms: ChatRooms) {
    registerRoute(fastify, int_url.http.chat.getUserConnections, async (request, reply) => {
        const userId = Number(request.params.userId);
        const result: Set<number> = new Set();

        for (const room of singletonChatRooms.rooms.values()) {
            if (room.users.find((id) => id === userId)) {
                for (const uid of room.users) {
                    result.add(uid);
                }
            }
        }

        return reply.status(200).send(Array.from(result));
    });
}

export default chatEndpoints;