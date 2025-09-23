import { LoginRequestBody, LoginRequestBodySchema } from './utils/api/service/auth_interfaces.js';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

const fastify: FastifyInstance = Fastify({ logger: true });

const secretKey = "shgdfkjwriuhfsdjkghdfjvnsdk";

fastify.post('/api/login', {
	schema: {
		body: LoginRequestBodySchema
	}
}, async (request: FastifyRequest<{ Body: LoginRequestBody }>, reply: FastifyReply) => {
	const { username, password } = request.body;
	try {
		let response;
		try {
			response = await axios.post(
				`http://database_service:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS}/api/users/validate`,
				{ username, password }
			);
		} catch (err) {
			if (response && response.status === 401) {
				return reply.status(401).send({ error: 'Invalid credentials' });
			}
			throw err;
		}

		console.log(`Login attempt for user: ${username}`);
		return reply.status(200).send({ message: 'Login successful' });
	
	} catch (error) {
		console.error('Error validating user credentials:', error);
		return reply.status(500).send({ error: 'User service unavailable' });
	}
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
