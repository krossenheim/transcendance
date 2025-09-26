'use strict'
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { CreateUserType } from './utils/api/service/auth/createUser.js';
import type { TokenDataType } from './utils/api/service/auth/tokenData.js';
import { AuthResponse } from './utils/api/service/auth/loginResponse.js';
import { ErrorResponse } from './utils/api/service/common/error.js';
import { CreateUser } from './utils/api/service/auth/createUser.js';
import { LoginUser } from './utils/api/service/auth/loginUser.js';
import type { UserType } from './utils/api/service/db/user.js';
import  { User } from './utils/api/service/db/user.js';
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

function generateToken(userId: number): TokenDataType {
	return {
		jwt: jwt.sign({ uid: userId }, secretKey, { expiresIn: '1h' }),
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
	const response = await containers.db.post('/api/users/validate', {
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

	const parse = User.safeParse(response.data);
	if (response.status !== 200 || !parse.success) {
		console.error('Unexpected response from user service:', response.status, response.data);
		console.error('Parsing error:', parse.error);
		return reply.status(500).send({ message: 'User service dropping agreement' });
	}

	const user: UserType = parse.data;
	return reply.status(200).send({ user, tokens: generateToken(user.id) });
});

fastify.get('/api/ping', {}, async (request, response) => {
	return response.status(200).send("Hello World!");
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
