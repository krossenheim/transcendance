'use strict'
import { SingleToken, TokenData, TokenPayload, type SingleTokenType, type TokenDataType } from './utils/api/service/auth/tokenData.js';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { AuthClientRequest, type AuthClientRequestType } from './utils/api/service/common/clientRequest.js';
import type { CreateUserType } from './utils/api/service/auth/createUser.js';
import { AuthResponse, type AuthResponseType } from './utils/api/service/auth/loginResponse.js';
import { StoreTokenPayload, VerifyTokenPayload } from './utils/api/service/db/token.js';
import { ErrorResponse, type ErrorResponseType } from './utils/api/service/common/error.js';
import { CreateUser } from './utils/api/service/auth/createUser.js';
import type { FullUserType } from './utils/api/service/db/user.js';
import { LoginUser } from './utils/api/service/auth/loginUser.js';
import { FullUser, User } from './utils/api/service/db/user.js';
import { Result } from './utils/api/service/common/result.js';
import containers from './utils/internal_api.js'
import Fastify from 'fastify';
import { z } from 'zod'
import { registerRoute } from './utils/api/service/common/fastify.js';
import { int_url, pub_url, user_url } from './utils/api/service/common/endpoints.js';
import { TwoFactorRequiredResponse, type TwoFactorRequiredResponseType } from './utils/api/service/auth/twoFactorRequired.js';

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Temporary storage for pending 2FA logins (in production, use Redis)
const pending2FALogins = new Map<string, { userId: number; timestamp: number }>();

// Clean up expired temp tokens every 5 minutes
setInterval(() => {
	const now = Date.now();
	for (const [token, data] of pending2FALogins.entries()) {
		if (now - data.timestamp > 5 * 60 * 1000) { // 5 minutes
			pending2FALogins.delete(token);
		}
	}
}, 5 * 60 * 1000);

const zodFastify = (
	options: FastifyServerOptions = { logger: true }
) => {
	const server = Fastify(options);
	server.setValidatorCompiler(validatorCompiler);
	server.setSerializerCompiler(serializerCompiler);
	return server;
}

const fastify: FastifyInstance = zodFastify();

const secretKey = "shgdfkjwriuhfsdjkghdfjvnsdk";
const jwtExpiry = '15min'; // 15 min

async function generateToken(userId: number): Promise<Result<TokenDataType, ErrorResponseType>> {
	const newRefreshToken = crypto.randomBytes(64).toString('hex');

	const response = await containers.db.post(int_url.http.db.storeToken, StoreTokenPayload.parse({
		userId: userId,
		token: newRefreshToken,
	}));

	if (response.isErr())
		return Result.Err({ message: 'Token service unreachable' });

	if (response.unwrap().status !== 200)
		return Result.Err({ message: 'Token service could not process request' });

	return Result.Ok({
		jwt: jwt.sign(TokenPayload.parse({ uid: userId }), secretKey, { expiresIn: jwtExpiry }),
		refresh: newRefreshToken,
	});
}

function validateToken(token: string): Result<number, string> {
	let decoded: { uid: number; iat: number; exp: number; };
	try {
		decoded = jwt.verify(token, secretKey) as { uid: number; iat: number; exp: number; };
	} catch (err) {
		return Result.Err('Invalid JWT');
	}

	if (typeof decoded.exp !== 'number' || Date.now() >= decoded.exp * 1000) {
		return Result.Err('JWT expired');
	}

	if (typeof decoded.uid !== 'number' || decoded.uid < 1)
		return Result.Err('Invalid JWT payload');
	else
		return Result.Ok(decoded.uid);
}

registerRoute(fastify, pub_url.http.auth.loginUser, async (request, reply) => {
	const responseResult = await containers.db.post(int_url.http.db.loginUser, {
		username: request.body.username,
		password: request.body.password,
	});

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	console.log("Response from user service:", response.status, response.data);
	if (response.status === 401) {
		return reply.status(401).send({ message: 'Invalid credentials' });
	}

	const parse = FullUser.safeParse(response.data);
	if (response.status !== 200 || !parse.success) {
		console.error('Unexpected response from user service:', response.status, response.data);
		console.error('Parsing error:', parse.error);
		return reply.status(500).send({ message: 'User service dropping agreement' });
	}

	const user: FullUserType = parse.data;

	// Check if user has 2FA enabled
	if (user.has2FA) {
		// Generate temporary token for 2FA verification
		const tempToken = crypto.randomBytes(32).toString('hex');
		pending2FALogins.set(tempToken, {
			userId: user.id,
			timestamp: Date.now(),
		});

		// TypeScript narrowing - cast reply to any to send 2FA response
		return (reply as any).status(200).send({
			requires2FA: true,
			userId: user.id,
			tempToken: tempToken,
		});
	}

	// No 2FA required, proceed with normal login
	const tokenResult = await generateToken(user.id);

	if (tokenResult.isOk())
		return reply.status(200).send({ user, tokens: tokenResult.unwrap() });
	else
		return reply.status(500).send(tokenResult.unwrapErr());
});

registerRoute(fastify, pub_url.http.auth.createNormalUser, async (request, reply) => {
	const responseResult = await containers.db.post(int_url.http.db.createNormalUser, request.body);

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}
	const response = responseResult.unwrap();
	console.log("Response from user service:", response.status, response.data);

	if (response.status === 400) {
		return reply.status(400).send({ message: 'Invalid user data or user already exists' });
	}

	const parse = FullUser.safeParse(response.data);
	if (response.status !== 201 || !parse.success) {
		console.error('Unexpected response from user service:', response.status, response.data);
		console.error('Parsing error:', parse.error);
		return reply.status(500).send({ message: 'User service dropping agreement' });
	}

	const user: FullUserType = parse.data;
	const tokens = await generateToken(user.id);

	if (tokens.isOk())
		return reply.status(201).send({ user, tokens: tokens.unwrap() });
	else
		return reply.status(500).send(tokens.unwrapErr());
});

registerRoute(fastify, pub_url.http.auth.createGuestUser, async (request, reply) => {
	const responseResult = await containers.db.get(int_url.http.db.createGuestUser);

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}
	const response = responseResult.unwrap();
	console.log("Response from user service:", response.status, response.data);

	const newUserParse = FullUser.safeParse(response.data);
	if (response.status !== 201 || !newUserParse.success) {
		console.error('Unexpected response from user service:', response.status, response.data);
		if (!newUserParse.success)
			console.error('Parsing error:', newUserParse.error);
		return reply.status(500).send({ message: 'User service dropping agreement' });
	}

	const newUser: FullUserType = newUserParse.data;
	const tokens = await generateToken(newUser.id);

	if (tokens.isErr())
		return reply.status(500).send(tokens.unwrapErr());
	else
		return reply.status(201).send({ user: newUser, tokens: tokens.unwrap() });
});

registerRoute(fastify, pub_url.http.auth.validateToken, async (request, reply) => {
	const validation = validateToken(request.body.token);
	if (validation.isErr())
		return reply.status(401).send({ message: validation.unwrapErr() });
	else
		return reply.status(200).send(validation.unwrap());
});

registerRoute(fastify, pub_url.http.auth.refreshToken, async (request, reply) => {
	const responseResult = await containers.db.post(int_url.http.db.validateToken, VerifyTokenPayload.parse({
		token: request.body.token,
	}));

	if (responseResult.isErr())
		return reply.status(500).send({ message: responseResult.unwrapErr() });

	const response = responseResult.unwrap();
	if (response.status === 200) {
		const userParse = FullUser.parse(response.data);
		const newToken = await generateToken(userParse.id);
		if (newToken.isOk())
			return reply.status(200).send({ user: userParse, tokens: newToken.unwrap() });
		else
			return reply.status(500).send(newToken.unwrapErr());
	}

	if (response.status === 401)
		return reply.status(401).send({ message: 'Invalid refresh token' });

	return reply.status(500).send(ErrorResponse.parse(response.data));
});

registerRoute(fastify, user_url.http.auth.logoutUser, async (request, reply) => {
	const responseResult = await containers.db.post(int_url.http.db.logoutUser, {
		userId: request.body.userId,
	});

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	if (response.status === 200) {
		return reply.status(200).send(null);
	} else {
		return reply.status(500).send({ message: 'Failed to log out' });
	}
});

// 2FA Setup: Generate QR code
registerRoute(fastify, pub_url.http.auth.setup2FA, async (request, reply) => {
	const { userId, username } = request.body;

	const responseResult = await containers.db.post(int_url.http.db.generate2FASecret, {
		userId,
		username,
	});

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	if (response.status === 200) {
		return reply.status(200).send(response.data);
	} else {
		return reply.status(500).send({ message: 'Failed to generate 2FA secret' });
	}
});

// 2FA Enable: Verify code and enable 2FA
registerRoute(fastify, pub_url.http.auth.enable2FA, async (request, reply) => {
	const { userId, code } = request.body;

	const responseResult = await containers.db.post(int_url.http.db.enable2FA, {
		userId,
		code,
	});

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	if (response.status === 200) {
		return reply.status(200).send(response.data);
	} else if (response.status === 400) {
		return reply.status(400).send(response.data);
	} else {
		return reply.status(500).send({ message: 'Failed to enable 2FA' });
	}
});

// 2FA Disable
registerRoute(fastify, pub_url.http.auth.disable2FA, async (request, reply) => {
	const { userId } = request.body;

	const responseResult = await containers.db.post(int_url.http.db.disable2FA, {
		userId,
	});

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	if (response.status === 200) {
		return reply.status(200).send(response.data);
	} else {
		return reply.status(500).send({ message: 'Failed to disable 2FA' });
	}
});

// 2FA Login: Verify code after username/password
registerRoute(fastify, pub_url.http.auth.verify2FALogin, async (request, reply) => {
	const { tempToken, code } = request.body;

	// Check if temp token exists
	const pendingLogin = pending2FALogins.get(tempToken);
	if (!pendingLogin) {
		return reply.status(401).send({ message: 'Invalid or expired temp token' });
	}

	// Verify the 2FA code
	const responseResult = await containers.db.post(int_url.http.db.verify2FACode, {
		userId: pendingLogin.userId,
		code,
	});

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	if (response.status !== 200) {
		return reply.status(401).send({ message: 'Invalid 2FA code' });
	}

	// Valid code - delete temp token and generate real tokens
	pending2FALogins.delete(tempToken);

	// Fetch user data
	const userFetchResult = await containers.db.fetchUserData(pendingLogin.userId);
	
	if (userFetchResult.isErr()) {
		return reply.status(500).send({ message: 'Failed to fetch user data' });
	}

	const user = userFetchResult.unwrap();
	const tokenResult = await generateToken(user.id);

	if (tokenResult.isOk())
		return reply.status(200).send({ user, tokens: tokenResult.unwrap() });
	else
		return reply.status(500).send(tokenResult.unwrapErr());
});

const port = parseInt(process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || '3000', 10);
const host = process.env.AUTH_BIND_TO || '0.0.0.0';

fastify.listen({ port, host }, (err, address) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	fastify.log.info(`Server listening at ${address}`);
});
