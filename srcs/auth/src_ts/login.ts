import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const fastify = Fastify({ logger: true });

async function userRoutes(fastify: FastifyInstance, options: any) {
	fastify.get('/users', async (request: FastifyRequest, reply: FastifyReply) => {
		console.log(request);
		console.log(1);
		return reply.status(200).send({ message: 'User list fetched successfully' });
	});

	fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
		console.log(request);
		console.log(2);
		const id = parseInt(request.params.id);
		const user = options.database.fetchUserById(id);
		if (user) {
			return reply.status(200).send(user);
		} else {
			reply.status(404).send({ error: 'User not found' });
		}
	});

	fastify.post('/create', async (request, reply) => {
		console.log(request);
		console.log(3);
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

module.exports = userRoutes;
