import { ChatRoomUserAccessType } from "@app/shared/api/service/chat/db_models";
import { registerRoute } from "@app/shared/api/service/common/fastify";
import { int_url } from "@app/shared/api/service/common/endpoints";
import { chatService } from "../main.js";

export async function chatRoutes(fastify: any) {
    registerRoute(fastify, int_url.http.db.createChatRoom, async (request, reply) => {
        const createRoomResult = chatService.createNewChatRoom(request.body.roomName, request.body.owner);
        if (createRoomResult.isErr())
            return reply.status(500).send({ message: createRoomResult.unwrapErr().message });
        else return reply.status(201).send(createRoomResult.unwrap());
    });

    registerRoute(fastify, int_url.http.db.sendMessage, async (request, reply) => {
        const sendMessageResult = chatService.sendMessageToRoom(
            request.body.roomId,
            request.body.userId,
            request.body.messageString
        );
        if (sendMessageResult.isErr())
            return reply.status(500).send({ message: sendMessageResult.unwrapErr().message });
        else return reply.status(200).send(sendMessageResult.unwrap());
    });

    registerRoute(fastify, int_url.http.db.getRoomInfo, async (request, reply) => {
        const roomInfoResult = chatService.fetchRoomById(request.params.roomId);
        if (roomInfoResult.isErr())
            return reply.status(500).send({ message: roomInfoResult.unwrapErr().message });
        else return reply.status(200).send(roomInfoResult.unwrap());
    });

    registerRoute(fastify, int_url.http.db.getAllRooms, async (request, reply) => {
        const allRoomsResult = chatService.getAllRooms();
        if (allRoomsResult.isErr()) {
            console.error("Error fetching all rooms:", allRoomsResult.unwrapErr());
            return reply.status(500).send({ message: allRoomsResult.unwrapErr().message });
        }
        else return reply.status(200).send(allRoomsResult.unwrap());
    });

    registerRoute(fastify, int_url.http.db.getUserRooms, async (request, reply) => {
        const userRoomsResult = chatService.getUserRooms(request.params.userId, ChatRoomUserAccessType.JOINED);
        if (userRoomsResult.isErr())
            return reply.status(500).send({ message: userRoomsResult.unwrapErr().message });
        return reply.status(200).send(userRoomsResult.unwrap());
    });

    registerRoute(fastify, int_url.http.db.addUserToRoom, async (request, reply) => {
        const addUserResult = chatService.setUserRoomAccessType(
            request.body.user_to_add,
            request.body.roomId,
            request.body.type
        );
        if (addUserResult.isErr())
            return reply.status(500).send({ message: addUserResult.unwrapErr().message });
        else return reply.status(200).send(null);
    });

    registerRoute(fastify, int_url.http.db.removeUserFromRoom, async (request, reply) => {
        const removeUserResult = chatService.removeUserFromRoom(
            request.body.user_to_remove,
            request.body.roomId
        );
        if (removeUserResult.isErr())
            return reply.status(500).send({ message: removeUserResult.unwrapErr().message });
        else return reply.status(200).send(null);
    });

    registerRoute(fastify, int_url.http.db.fetchDMRoomInfo, async (request, reply) => {
        const fetchDMRoomResult = chatService.fetchDMRoom(request.params.userId1, request.params.userId2);
        if (fetchDMRoomResult.isErr())
            return reply.status(500).send({ message: fetchDMRoomResult.unwrapErr().message });
        else return reply.status(200).send(fetchDMRoomResult.unwrap());
    });
}

export default chatRoutes;

