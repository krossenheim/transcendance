const fastify = require('fastify')({ logger: true });
const axios = require('axios');

fastify.post('/api/login', async (request, reply) => {
	const { username, password } = request.body;
	if (!username || !password) {
		return reply.status(400).send({ error: 'Username and password are required' });
	}

	try {
		const response = await axios.post(
			`https://database_service:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS}/api/users/validate`,
			{ username, password }
		);
		if (!response.data.success) {
			return reply.status(401).send({ error: 'Invalid credentials' });
		}
	} catch (error) {
		console.error('Error validating user credentials:', error);
		return reply.status(500).send({ error: 'User service unavailable' });
	}

	console.log(`Login attempt for user: ${username}`);
	return reply.status(200).send({ message: 'Login successful' });
});

fastify.listen({ port: process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS, host: process.env.AUTH_BIND_TO }, (err, address) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	fastify.log.info(`Server listening at ${address}`);
});
