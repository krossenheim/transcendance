import token, { VerifyTokenPayload, type VerifyTokenPayloadType, StoreTokenPayload, type StoreTokenPayloadType } from '../utils/api/service/db/token.js';
import type { ErrorResponseType } from '../utils/api/service/common/error.js';
import { FullUser, type FullUserType } from '../utils/api/service/db/user.js';
import { ErrorResponse } from '../utils/api/service/common/error.js';
import { tokenService, userService } from '../main.js';
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';

const TokenSecretKey = "hfskjryfweuifhjsdkghdnfbvdbviuweryteiuwtwhejkrfhrskjd";

function hashToken(plainToken: string): string {
	return crypto
		.createHmac("sha256", TokenSecretKey)
		.update(plainToken)
		.digest("hex");
}

async function tokenRoutes(fastify: FastifyInstance) {
	type VerifyTokenSchema = {
		Body: VerifyTokenPayloadType,
		Reply: {
			200: FullUserType;
			401: ErrorResponseType;
			500: ErrorResponseType;
		}
	};

	fastify.post<VerifyTokenSchema>('/isValid', {
		schema: {
			body: VerifyTokenPayload,
			response: {
				200: FullUser, // Token valid
				401: ErrorResponse, // Token invalid
				500: ErrorResponse, // Internal server error
			}
		}
	}, async (request, reply) => {
		const hashedToken = hashToken(request.body.token);
		const tokenResult = tokenService.fetchUserIdFromToken(hashedToken);

		if (tokenResult.isErr())
			return reply.status(401).send({ message: tokenResult.unwrapErr() });

		const userResult = userService.fetchUserById(tokenResult.unwrap());
		if (userResult.isErr())
			return reply.status(500).send({ message: userResult.unwrapErr() });

		return reply.status(200).send(userResult.unwrap());
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
		const { userId, token } = request.body;
		const tokenHash = hashToken(token);

		const success = tokenService.storeToken(userId, tokenHash);
		if (!success)
			return reply.status(500).send({ message: 'Failed to store token' });

		return reply.status(200).send(null);
	});
}

export default tokenRoutes;
