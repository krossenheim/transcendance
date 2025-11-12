import { VerifyTokenPayload, StoreTokenPayload } from '../utils/api/service/db/token.js';
import { registerRoute } from '../utils/api/service/common/fastify.js';
import { ErrorResponse } from '../utils/api/service/common/error.js';
import { FullUser } from '../utils/api/service/db/user.js';
import { tokenService, userService } from '../main.js';

import type { ZodSchema } from '../utils/api/service/common/zodUtils.js';
import type { FastifyInstance } from 'fastify';

import crypto from 'crypto';
import { z } from 'zod';
import {  int_url } from '../utils/api/service/common/endpoints.js';
// TODO : Move to env variable or config file
const TokenSecretKey = "hfskjryfweuifhjsdkghdnfbvdbviuweryteiuwtwhejkrfhrskjd";

function hashToken(plainToken: string): string {
	return crypto
		.createHmac("sha256", TokenSecretKey)
		.update(plainToken)
		.digest("hex");
}

async function tokenRoutes(fastify: FastifyInstance) {
	registerRoute(fastify, int_url.http.db.validateToken, async (request, reply) => {
		const hashedToken = hashToken(request.body.token);
		const tokenResult = tokenService.fetchUserIdFromToken(hashedToken);

		if (tokenResult.isErr())
			return reply.status(401).send({ message: tokenResult.unwrapErr() });

		const userResult = userService.fetchUserById(tokenResult.unwrap());
		if (userResult.isErr())
			return reply.status(500).send({ message: userResult.unwrapErr() });

		return reply.status(200).send(userResult.unwrap());
	});

	registerRoute(fastify, int_url.http.db.storeToken, async (request, reply) => {
		const { userId, token } = request.body;
		const tokenHash = hashToken(token);

		const success = tokenService.storeToken(userId, tokenHash);
		if (!success)
			return reply.status(500).send({ message: 'Failed to store token' });

		return reply.status(200).send(null);
	});

	registerRoute(fastify, int_url.http.db.logoutUser, async (request, reply) => {
		const { userId } = request.body;

		const result = tokenService.removeTokenByUserId(userId);
		if (result.isErr()) {
			return reply.status(500).send({ message: result.unwrapErr() });
		}

		return reply.status(200).send(null);
	});
}

export default tokenRoutes;
