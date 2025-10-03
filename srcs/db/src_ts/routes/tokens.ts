import token, { VerifyTokenPayload, type VerifyTokenPayloadType } from '../utils/api/service/db/token.js';
import type { ErrorResponseType } from '../utils/api/service/common/error.js';
import { ErrorResponse } from '../utils/api/service/common/error.js';
import type { FastifyInstance } from 'fastify';
import { tokenService } from '../main.js';
import bcrypt from 'bcrypt';
import { z } from 'zod';

const SALT_ROUNDS = 10;

async function hashToken(plainToken: string): Promise<string> {
	return await bcrypt.hash(plainToken, SALT_ROUNDS);
}

async function verifyToken(plainToken: string, hashedToken: string): Promise<boolean> {
	return await bcrypt.compare(plainToken, hashedToken);
}

async function tokenRoutes(fastify: FastifyInstance) {
	type VerifyTokenSchema = {
		Body: VerifyTokenPayloadType,
		Reply: {
			200: null;
			401: ErrorResponseType;
			500: ErrorResponseType;
		}
	};

	fastify.post<VerifyTokenSchema>('/isValid', {
		schema: {
			body: VerifyTokenPayload,
			response: {
				200: z.null(), // Token valid
				401: ErrorResponse, // Token invalid
				500: ErrorResponse, // Internal server error
			}
		}
	}, async (request, reply) => {
		const { userId, token } = request.body;
		const tokenHash = tokenService.fetchTokenHash(userId);

		if (!tokenHash)
			return reply.status(401).send({ message: 'Token not found' });

		const isValid = await verifyToken(token, tokenHash);
		if (!isValid)
			return reply.status(401).send({ message: 'Invalid token' });

		return reply.status(200).send(null);
	});

	type StoreTokenSchema = {
		Body: VerifyTokenPayloadType,
		Reply: {
			200: null;
			500: ErrorResponseType;
		}
	}

	fastify.post<StoreTokenSchema>('/store', {
		schema: {
			body: VerifyTokenPayload,
			response: {
				200: z.null(), // Token stored
				500: ErrorResponse, // Internal server error
			}
		}
	}, async (request, reply) => {
		const { userId, token } = request.body;
		const tokenHash = await hashToken(token);

		const success = tokenService.storeToken(userId, tokenHash);
		if (!success)
			return reply.status(500).send({ message: 'Failed to store token' });

		return reply.status(200).send(null);
	});
}

export default tokenRoutes;
