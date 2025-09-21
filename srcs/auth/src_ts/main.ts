const fastify = require('fastify')({ logger: true });
const axios = require('axios');
const jwt = require('jsonwebtoken');

const secretKey = "shgdfkjwriuhfsdjkghdfjvnsdk";

fastify.post('/api/login', async (request, reply) => {
	const { username, password } = request.body;
	if (!username || !password) {
		return reply.status(400).send({ error: 'Username and password are required' });
	}

	try {
		let response;
		try {
			response = await axios.post(
				`http://database_service:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS}/api/users/validate`,
				{ username, password }
			);
		} catch (err) {
			if (err.response && err.response.status === 401) {
				return reply.status(401).send({ error: 'Invalid credentials' });
			}
			throw err;
		}

		console.log(`Login attempt for user: ${username}`);
		return reply.status(200).send({ message: 'Login successful' }, { token: jwt.sign({ userId: user.id }, secretKey), user: response.body });
	
	} catch (error) {
		console.error('Error validating user credentials:', error);
		return reply.status(500).send({ error: 'User service unavailable' });
	}
});

fastify.listen({ port: process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS, host: process.env.AUTH_BIND_TO }, (err, address) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	fastify.log.info(`Server listening at ${address}`);
});
