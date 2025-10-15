"use strict";
import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import {
  socketToHub,
  setSocketOnMessageHandler,
} from "./utils/socket_to_hub.js";
import Fastify from "fastify";
import ChatRooms from "./roomClass.js";
import websocketPlugin, { type WebsocketHandler } from "@fastify/websocket";


const fastify = Fastify({
  logger: {
    level: "info", // or 'debug' for more verbosity
    transport: {
      target: "pino-pretty", // pretty-print logs in development
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
});

fastify.register(websocketPlugin);

import { user_url } from "./utils/api/service/common/endpoints.js";
export function registerRouteWS(
	socket: WebSocket,
	route: T,
	handler: (
		req: FastifyRequest<
			{
				Body: RouteBody<T>;
				Querystring: T["schema"] extends { query: z.ZodTypeAny }
				? z.infer<T["schema"]["query"]>
				: never;
				Params: T["schema"] extends { params: z.ZodTypeAny }
				? z.infer<T["schema"]["params"]>
				: never;
			}
		>,
		reply: ReplyOf<T>
	) => Promise<void>
) {
	const method = (route.method ?? "POST").toLowerCase() as
		| "get"
		| "post"
		| "put"
		| "delete";

	fastify[method](route.endpoint, { schema: route.schema }, async (req, reply) => {
		await handler(req as any, reply as any);
	});
}

const singletonChatRooms = new ChatRooms();
for (const endpointInfo in user_url.ws)
{

}

// const chatRoomTasks = {
//   ADD_A_NEW_ROOM: {
//     funcId: "/api/chat/add_a_new_room",
//     handler: singletonChatRooms.addRoom.bind(singletonChatRooms),
//   },
//   LIST_ROOMS: {
//     funcId: "/api/chat/list_rooms",
//     handler: singletonChatRooms.listRooms.bind(singletonChatRooms),
//   },
//   SEND_MESSAGE_TO_ROOM: {
//     funcId: "/api/chat/send_message_to_room",
//     handler: singletonChatRooms.sendMessage.bind(singletonChatRooms),
//   },
//   ADD_USER_TO_ROOM: {
//     funcId: "/api/chat/add_to_room",
//     handler: singletonChatRooms.addUserToRoom.bind(singletonChatRooms),
//   },
// };

// setSocketOnMessageHandler(socketToHub, { tasks: chatRoomTasks });

