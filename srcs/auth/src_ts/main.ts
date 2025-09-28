'use strict'
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { CreateUserType } from './utils/api/service/auth/createUser.js';
import type { TokenDataType } from './utils/api/service/auth/tokenData.js';
import { AuthResponse } from './utils/api/service/auth/loginResponse.js';
import { ErrorResponse } from './utils/api/service/common/error.js';
import { CreateUser } from './utils/api/service/auth/createUser.js';
import { LoginUser } from './utils/api/service/auth/loginUser.js';
import type { FullUserType } from './utils/api/service/db/user.js';
import  { FullUser, User } from './utils/api/service/db/user.js';
import containers from './utils/internal_api.js'
import Fastify from 'fastify';
import { z } from 'zod'

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

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

function generateToken(user: FullUserType): TokenDataType {
	return {
		jwt: jwt.sign({ uid: user.id, isGuest: false }, secretKey, { expiresIn: '1h' }),
		refresh: crypto.randomBytes(64).toString('hex'),
	};
}

type LoginSchema = {
	Body: z.infer<typeof LoginUser>;
	Reply: {
		200: z.infer<typeof AuthResponse>;
		401: z.infer<typeof ErrorResponse>;
		500: z.infer<typeof ErrorResponse>;
	};
};

fastify.post<{
	Body: LoginSchema['Body'];
	Reply: LoginSchema['Reply'];
}>('/api/login', {
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
	return reply.status(200).send({ user, tokens: generateToken(user) });
});

type CreateAccountSchemama = {
	Body: z.infer<typeof CreateUser>;
	Reply: {
		201: z.infer<typeof AuthResponse>;
		400: z.infer<typeof ErrorResponse>;
		500: z.infer<typeof ErrorResponse>;
	};
}

fastify.post<{
	Body: CreateAccountSchemama['Body'];
	Reply: CreateAccountSchemama['Reply'];
}>('/api/create/user', {
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
	return reply.status(201).send({ user, tokens: generateToken(user) });
});

type CreateGuestSchema = {
	Reply: {
		201: z.infer<typeof FullUser>;
		500: z.infer<typeof ErrorResponse>;
	};
}

fastify.get<{
	Reply: CreateGuestSchema['Reply'];
}>('/api/create/guest', {
	schema: {
		response: {
			201: FullUser,
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
	return reply.status(201).send(newUser);
});

fastify.get('/api/ping', {}, async (request, reply) => {
	return reply.status(200).send("Hello World!");
})

const port = parseInt(process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || '3000', 10);
const host = process.env.AUTH_BIND_TO || '0.0.0.0';

fastify.listen({ port, host }, (err, address) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	fastify.log.info(`Server listening at ${address}`);
});
