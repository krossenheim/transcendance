import Fastify, { FastifyInstance, FastifyRequest, FastifyReply, FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { CreateUser, CreateUserType } from './utils/api/service/auth/createUser';
import { LoginUser, LoginUserType } from './utils/api/service/auth/loginUser';
import { TokenData, TokenDataType } from './utils/api/service/auth/tokenData';
import { User, UserType } from './utils/api/service/db/user';

import containers from './utils/internal_api'

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import axios from 'axios';

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

fastify.post('/api/login', {
	schema: {
		body: LoginUser
	}
}, async (request: FastifyRequest<{ Body: LoginUserType }>, reply: FastifyReply) => {
	const response = containers.db.post<UserType>('/api/users/validate', {
		username: request.body.username,
		password: request.body.password,
	});

	

	)
	try {
		let response;
		try {
			response = await axios.post(
				`http://db:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS}/api/users/validate`,
				{ username: request.body.username, password: request.body.password },
			);
		} catch (err) {
			if (response && response.status === 401) {
				return reply.status(401).send({ error: 'Invalid credentials' });
			}
			throw err;
		}

		console.log(`Login attempt for user: ${request.body.username}`);
		return reply.status(200).send({ message: 'Login successful', user: response.data.user, token: generateToken(response.data.user.id) });
	
	} catch (error) {
		console.error('Error validating user credentials:', error);
		return reply.status(500).send({ error: 'User service unavailable' });
	}
});

fastify.post('/api/create', {
	schema: {
		body: CreateUser
	}
}, async (request: FastifyRequest<{ Body: CreateUserType }>, reply: FastifyReply) => {
	// try {
	// 	let response;
	// 	try {

	// 	}
	// }
	return reply.status(501).send({ error: 'Not implemented' });
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
