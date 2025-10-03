'use strict'
import { SingleToken, TokenData, TokenPayload, type SingleTokenType, type TokenDataType } from './utils/api/service/auth/tokenData.js';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { AuthClientRequest, type AuthClientRequestType } from './utils/api/service/common/clientRequest.js';
import type { CreateUserType } from './utils/api/service/auth/createUser.js';
import { AuthResponse } from './utils/api/service/auth/loginResponse.js';
import { VerifyTokenPayload } from './utils/api/service/db/token.js';
import { ErrorResponse, type ErrorResponseType } from './utils/api/service/common/error.js';
import { CreateUser } from './utils/api/service/auth/createUser.js';
import { LoginUser } from './utils/api/service/auth/loginUser.js';
import type { FullUserType } from './utils/api/service/db/user.js';
import  { FullUser, User } from './utils/api/service/db/user.js';
import { Result } from './utils/api/service/common/result.js';
import containers from './utils/internal_api.js'
import Fastify from 'fastify';
import { z } from 'zod'

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { fa } from 'zod/locales';

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
const jwtExpiry = '1min'; // 1 min

async function generateToken(userId: number): Promise<Result<TokenDataType, ErrorResponseType>> {
	const newRefreshToken = crypto.randomBytes(64).toString('hex');

	const response = await containers.db.post('/tokens/store', VerifyTokenPayload.parse({
		userId: userId,
		token: newRefreshToken,
	}));

	if (response === undefined)
		return Result.Err({ message: 'Token service unreachable' });

	if (response.status !== 200)
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

type LoginSchema = {
	Body: z.infer<typeof LoginUser>;
	Reply: {
		200: z.infer<typeof AuthResponse>;
		401: z.infer<typeof ErrorResponse>;
		500: z.infer<typeof ErrorResponse>;
	}; 
};

fastify.post<LoginSchema>('/public_api/login', {
	schema: {
		body: LoginUser,
		response: {
			200: AuthResponse, // Login successful
			401: ErrorResponse, // Username/Password don't match / don't exist
			500: ErrorResponse, // Internal server error
		}
	}
}, async (request, reply) => {
	const response = await containers.db.post('/users/validate', {
		username: request.body.username,
		password: request.body.password,
	});
	
	if (response === undefined) {
		return reply.status(500).send({ message: 'User service unreachable' });
	}
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
	const tokenResult = await generateToken(user.id);

	if (tokenResult.isOk())
		return reply.status(200).send({ user, tokens: tokenResult.unwrap() });
	else
		return reply.status(500).send(tokenResult.unwrapErr());
});

type CreateAccountSchema = {
	Body: z.infer<typeof CreateUser>;
	Reply: {
		201: z.infer<typeof AuthResponse>;
		400: z.infer<typeof ErrorResponse>;
		500: z.infer<typeof ErrorResponse>;
	};
}

fastify.post<CreateAccountSchema>('/public_api/create/user', {
	schema: {
		body: CreateUser,
		response: {
			201: AuthResponse, // Created user
			400: ErrorResponse, // Missing fields / User already exists
			500: ErrorResponse, // Internal server error
		}
	}
}, async (request, reply) => {
	const response = await containers.db.post('/users/create/normal', request.body);

	if (response === undefined) {
		return reply.status(500).send({ message: 'User service unreachable' });
	}
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

type CreateGuestSchema = {
	Reply: {
		201: z.infer<typeof AuthResponse>;
		500: z.infer<typeof ErrorResponse>;
	};
}

fastify.get<CreateGuestSchema>('/public_api/create/guest', {
	schema: {
		response: {
			201: AuthResponse,
			500: ErrorResponse,
		}
	}
}, async (request, reply) => {
	const response = await containers.db.get('/users/create/guest');

	if (response === undefined) {
		return reply.status(500).send({ message: 'User service unreachable' });
	}
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

type ValidateJWTSchema = {
	Body: SingleTokenType,
	Reply: {
		200: number;
		401: z.infer<typeof ErrorResponse>;
		500: z.infer<typeof ErrorResponse>;
	};
}

fastify.post<ValidateJWTSchema>('/internal_api/token/validate', {
	schema: {
		body: SingleToken,
		response: {
			200: z.number(), // Token valid - return user ID
			401: ErrorResponse, // Token invalid
			500: ErrorResponse, // Internal server error
		}
	}
}, async (request, reply) => {
	const validation = validateToken(request.body.token);
	if (validation.isErr())
		return reply.status(401).send({ message: validation.unwrapErr() });
	else
		return reply.status(200).send(validation.unwrap());
});

type TokenRefreshSchema = {
	Body: AuthClientRequestType<typeof SingleToken>,
	Reply: {
		200: TokenDataType,
		401: z.infer<typeof ErrorResponse>;
		500: z.infer<typeof ErrorResponse>;
	};
}

fastify.post<TokenRefreshSchema>('/api/token/refresh', {
	schema: {
		body: AuthClientRequest(SingleToken),
		response: {
			200: TokenData,
			500: ErrorResponse,
		}
	}
}, async (request, reply) => {
	const response = await containers.db.post('/tokens/isValid', VerifyTokenPayload.parse({
		userId: request.body.userId,
		token: request.body.payload.token,
	}));

	if (response === undefined)
		return reply.status(500).send({ message: 'Token service unreachable' });

	if (response.status === 200) {
		const newToken = await generateToken(request.body.userId);
		if (newToken.isOk())
			return reply.status(200).send(newToken.unwrap());
		else
			return reply.status(500).send(newToken.unwrapErr());
	}

	if (response.status === 401)
		return reply.status(401).send({ message: 'Invalid refresh token' });

	const errorData = ErrorResponse.safeParse(response.data);
	if (!errorData.success)
		return reply.status(500).send({ message: 'Token service dropping agreement' });
	else
		return reply.status(500).send(errorData.data);
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
