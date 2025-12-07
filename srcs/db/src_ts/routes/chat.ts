import { ChatRoomType } from "../utils/api/service/chat/chat_interfaces.js";
import { registerRoute } from "../utils/api/service/common/fastify.js";
import { int_url } from "../utils/api/service/common/endpoints.js";
import { chatService } from "../main.js";

import type { FastifyInstance } from "fastify";

export async function chatRoutes(fastify: FastifyInstance) {
    registerRoute(fastify, int_url.http.db.createChatRoom, async (request, reply) => {
        const createRoomResult = chatService.createNewRoom(request.body.roomName, ChatRoomType.PRIVATE, request.body.owner);
        if (createRoomResult.isErr())
            return reply.status(500).send({ message: createRoomResult.unwrapErr() });
        else return reply.status(201).send(createRoomResult.unwrap());
    });

    registerRoute(fastify, int_url.http.db.sendMessage, async (request, reply) => {
        const sendMessageResult = chatService.sendMessageToRoom(
            request.body.roomId,
            request.body.userId,
            request.body.messageString
        );
        if (sendMessageResult.isErr())
            return reply.status(500).send({ message: sendMessageResult.unwrapErr() });
        else return reply.status(200).send(sendMessageResult.unwrap());
    });

    registerRoute(fastify, int_url.http.db.getRoomInfo, async (request, reply) => {
        const roomInfoResult = chatService.fetchRoomById(request.params.roomId);
        if (roomInfoResult.isErr())
            return reply.status(500).send({ message: roomInfoResult.unwrapErr() });
        else return reply.status(200).send(roomInfoResult.unwrap());
    });

    registerRoute(fastify, int_url.http.db.getUserRooms, async (request, reply) => {
        const userRoomsResult = chatService.getUserRooms(request.params.userId);
        if (userRoomsResult.isErr())
            return reply.status(500).send({ message: userRoomsResult.unwrapErr() });
        else return reply.status(200).send(userRoomsResult.unwrap());
    });

    registerRoute(fastify, int_url.http.db.addUserToRoom, async (request, reply) => {
        const addUserResult = chatService.setUserRoomAccessType(
            request.body.user_to_add,
            request.body.roomId,
            request.body.type
        );
        if (addUserResult.isErr())
            return reply.status(500).send({ message: addUserResult.unwrapErr() });
        else return reply.status(200).send(null);
    });

    registerRoute(fastify, int_url.http.db.removeUserFromRoom, async (request, reply) => {
        const removeUserResult = chatService.removeUserFromRoom(
            request.body.user_to_remove,
            request.body.roomId
        );
        if (removeUserResult.isErr())
            return reply.status(500).send({ message: removeUserResult.unwrapErr() });
        else return reply.status(200).send(null);
    });

    registerRoute(fastify, int_url.http.db.fetchDMRoomInfo, async (request, reply) => {
        const fetchDMRoomResult = chatService.fetchDMRoom(request.params.userId1, request.params.userId2);
        console.log(fetchDMRoomResult);
        if (fetchDMRoomResult.isErr())
            return reply.status(500).send({ message: fetchDMRoomResult.unwrapErr() });
        else return reply.status(200).send(fetchDMRoomResult.unwrap());
    });
}

export default chatRoutes;
