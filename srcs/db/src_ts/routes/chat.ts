import token, { VerifyTokenPayload, type VerifyTokenPayloadType, StoreTokenPayload, type StoreTokenPayloadType } from '../utils/api/service/db/token.js';
import type { ErrorResponseType } from '../utils/api/service/common/error.js';
import { StoredMessageSchema, ListRoomsSchema } from '../utils/api/service/chat/db_models.js';
import { ErrorResponse } from '../utils/api/service/common/error.js';
import { tokenService, userService } from '../main.js';
import type { FastifyInstance } from 'fastify';
import type { TypeUserSendMessagePayload, TypeAddRoomPayloadSchema,TypeAddToRoomPayload } from '../utils/api/service/chat/chat_interfaces.js';
import type { TypeStoredMessageSchema,TypeListRoomsSchema } from '../utils/api/service/chat/db_models.js';
import { z } from 'zod';


export async function chatRoutes(fastify: FastifyInstance) {
	type StoredMessageSchema = {
		Body: TypeAddRoomPayloadSchema,
		Reply: {
			200: TypeStoredMessageSchema;
			401: ErrorResponseType;
			500: ErrorResponseType;
		}
	};

	fastify.post<StoredMessageSchema>('/get_room_messages', {
		schema: {
			body: VerifyTokenPayload,
			response: {
				200: StoredMessageSchema, // Token valid
				401: ErrorResponse, // Token invalid
				500: ErrorResponse, // Internal server error
			}
		}
	}, async (request, reply) => {
		// const messages : 
		// const tokenResult = tokenService.fetchUserIdFromToken(hashedToken);

		// if (tokenResult.isErr())
		// 	return reply.status(401).send({ message: tokenResult.unwrapErr() });

		// const userResult = userService.fetchUserById(tokenResult.unwrap());
		// if (userResult.isErr())
		// 	return reply.status(500).send({ message: userResult.unwrapErr() });

		// return reply.status(200).send(userResult.unwrap());
	});

	type StoreTokenSchema = {
		Body: StoreTokenPayloadType,
		Reply: {
			200: null;
			500: ErrorResponseType;
		}
	}

	fastify.post<StoreTokenSchema>('/store', {
		schema: {
			body: StoreTokenPayload,
			response: {
				200: z.null(), // Token stored
				500: ErrorResponse, // Internal server error
			}
		}
	}, async (request, reply) => {
		// const { userId, token } = request.body;
		// const tokenHash = hashToken(token);

		// const success = tokenService.storeToken(userId, tokenHash);
		// if (!success)
		// 	return reply.status(500).send({ message: 'Failed to store token' });

		// return reply.status(200).send(null);
	});
}

export default chatRoutes;
