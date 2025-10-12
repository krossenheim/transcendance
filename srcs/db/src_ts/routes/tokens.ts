import { VerifyTokenPayload, StoreTokenPayload } from '../utils/api/service/db/token.js';
import { ErrorResponse } from '../utils/api/service/common/error.js';
import { FullUser } from '../utils/api/service/db/user.js';
import { tokenService, userService } from '../main.js';

import type { ZodSchema } from '../utils/api/service/common/zodUtils.js';
import type { FastifyInstance } from 'fastify';

import crypto from 'crypto';
import { z } from 'zod';
import { endpoints } from '../utils/api/service/common/endpoints.js';
// TODO : Move to env variable or config file
const TokenSecretKey = "hfskjryfweuifhjsdkghdnfbvdbviuweryteiuwtwhejkrfhrskjd";

function hashToken(plainToken: string): string {
	return crypto
		.createHmac("sha256", TokenSecretKey)
		.update(plainToken)
		.digest("hex");
}

async function tokenRoutes(fastify: FastifyInstance) {
	const validateTokenSchema = {
		body: VerifyTokenPayload,
		response: {
			200: FullUser, // Valid token; return user data
			401: ErrorResponse, // Invalid token; or token not found
			500: ErrorResponse, // Internal server error
		}
	};

	fastify.post<ZodSchema<typeof validateTokenSchema>>(
		'/isValid',
		{ schema: validateTokenSchema },
		async (request, reply) => {
			const hashedToken = hashToken(request.body.token);
			const tokenResult = tokenService.fetchUserIdFromToken(hashedToken);

			if (tokenResult.isErr())
				return reply.status(401).send({ message: tokenResult.unwrapErr() });

			const userResult = userService.fetchUserById(tokenResult.unwrap());
			if (userResult.isErr())
				return reply.status(500).send({ message: userResult.unwrapErr() });

			return reply.status(200).send(userResult.unwrap());
		}
	);

	const storeTokenSchema = {
		body: StoreTokenPayload,
		response: {
			200: z.null(), // Token was stored successfully
			500: ErrorResponse, // Internal server error
		}
	};

	fastify.post<ZodSchema<typeof storeTokenSchema>>(
		'/store', {
		schema: storeTokenSchema
	},
		async (request, reply) => {
			const { userId, token } = request.body;
			const tokenHash = hashToken(token);

			const success = tokenService.storeToken(userId, tokenHash);
			if (!success)
				return reply.status(500).send({ message: 'Failed to store token' });

			return reply.status(200).send(null);
		}
	);
}

export default tokenRoutes;
