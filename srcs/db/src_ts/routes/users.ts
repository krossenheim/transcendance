import { LoginRequestBody, LoginRequestBodySchema, CreateAccountRequestBodySchema, CreateAccountRequestBody } from '../utils/api/service/auth_interfaces.js';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Database from '../database';

const fastify = Fastify({ logger: true });

async function userRoutes(fastify: FastifyInstance, options: { database: Database }) {
	fastify.get('/users', async (request: FastifyRequest, reply: FastifyReply) => {
		console.log(request);
		console.log(1);
		return reply.status(200).send(options.database.fetchAllUsers());
	});

	fastify.post('/validate', {
		schema: {
			body: LoginRequestBodySchema
		}
	}, async (request: FastifyRequest<{ Body: LoginRequestBody }>, reply: FastifyReply) => {
		 const { username, password } = request.body;
		if (!username || !password) {
			return reply.status(400).send({ error: 'Username and password are required' });
		}
		const user = options.database.fetchUserFromCredentials(username, password);
		if (user) {
			return { success: true, user: user };
		} else {
			return reply.status(401).send({ success: false, error: 'Invalid credentials' });
		}
	});

	fastify.get('/:id', {
		schema: {
			params: {
				type: 'object',
				properties: {
					id: { type: 'string' },
				},
				required: ['id'],
			},
		}
	}, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
		const id = parseInt(request.params.id);
		const user = options.database.fetchUserById(id);
		if (user) {
			return user;
		} else {
			reply.status(404).send({ error: 'User not found' });
		}
	});

	fastify.post('/create', {
		schema: {
			body: CreateAccountRequestBodySchema
		}
	}, async (request: FastifyRequest<{ Body: CreateAccountRequestBody }>, reply: FastifyReply) => {
		const { username, email, password } = request.body;
		if (!username || !email || !password) {
			reply.status(400).send({ error: 'Username, email, and password are required' });
			return;
		}
		console.log("Creating user:", username, email);
		const user = options.database.createNewUser(username, email, password);
		reply.status(201).send(user);
	});
}

export default userRoutes;
