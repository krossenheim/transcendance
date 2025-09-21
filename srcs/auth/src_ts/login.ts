const fastify = require('fastify')({ logger: true });

async function userRoutes(fastify, options) {
	fastify.get('/users', async (request, reply) => {
		console.log(request);
		console.log(1);
		return options.database.fetchAllUsers();
	});

	fastify.get('/:id', async (request, reply) => {
		console.log(request);
		console.log(2);
		const id = parseInt(request.params.id);
		const user = options.database.fetchUserById(id);
		if (user) {
			return user;
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
