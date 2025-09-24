import { CreateUser, CreateUserType } from '../utils/api/service/auth/createUser';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LoginUser, LoginUserType } from '../utils/api/service/auth/loginUser';
import Database from '../database';
import bcrypt from 'bcrypt';
import { UserType } from '../utils/api/service/db/user';

const SALT_ROUNDS = 10;

async function hashPassword(plainPassword: string): Promise<string> {
	return await bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
	return await bcrypt.compare(plainPassword, hashedPassword);
}

async function userRoutes(fastify: FastifyInstance, options: { database: Database }) {
	fastify.get('/users', async (request: FastifyRequest, reply: FastifyReply) => {
		console.log(request);
		console.log(1);
		return reply.status(200).send(options.database.fetchAllUsers());
	});

	fastify.post('/validate', {
		schema: {
			body: LoginUser
		}
	}, async (request: FastifyRequest<{ Body: LoginUserType }>, reply: FastifyReply) => {
		const { username, password } = request.body;
		const user = options.database.fetchUserFromUsername(username);
		if (user && await verifyPassword(password, user.passwordHash || '')) {
			return reply.status(200).send({ user });
		} else {
			return reply.status(401).send({ user: undefined });
		}
	});

	fastify.get('/:id', {
		// schema: {
		// 	params: {
		// 		type: 'object',
		// 		properties: {
		// 			id: { type: 'string' },
		// 		},
		// 		required: ['id'],
		// 	},
		// }
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
			body: CreateUser
		}
	}, async (request: FastifyRequest<{ Body: CreateUserType }>, reply: FastifyReply) => {
		const { username, email, password } = request.body;
		if (!username || !email || !password) {
			reply.status(400).send({ error: 'Username, email, and password are required' });
			return;
		}
		console.log("Creating user:", username, email);
		const user = options.database.createNewUser(username, email, await hashPassword(password));
		reply.status(201).send(user);
	});
}

export default userRoutes;
