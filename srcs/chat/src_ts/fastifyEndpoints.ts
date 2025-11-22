import type { TypeStoredMessageSchema } from "./utils/api/service/chat/db_models.js";
import { registerRoute } from "./utils/api/service/common/fastify.js";
import { int_url, user_url } from "./utils/api/service/common/endpoints.js";
import { OurSocket } from "./utils/socket_to_hub.js";
import ChatRooms from "./roomClass.js";
import type { FastifyInstance } from "fastify";

export async function chatEndpoints(fastify: FastifyInstance, singletonChatRooms: ChatRooms, socket: OurSocket) {
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

    registerRoute(fastify, int_url.http.chat.sendSystemMessage, async (request, reply) => {
        const room = singletonChatRooms.rooms.get(request.body.roomId);
        if (!room)
            return reply.status(404).send({ message: 'Room not found' });

        socket.invokeHandler(
            user_url.ws.chat.sendMessage,
            1,
            { roomId: request.body.roomId, messageString: request.body.messageString }
        );

        return reply.status(200).send(null);
    });
}

export default chatEndpoints;