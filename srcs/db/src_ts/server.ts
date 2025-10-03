import userRoutes from './routes/users.js';
import Database from './database.js';
import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

const db = new Database('/etc/database_data/users.db');

fastify.register(userRoutes, { prefix: '/api/users', database: db });

const port = parseInt(process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || '3000', 10);
const host = process.env.AUTH_BIND_TO || '0.0.0.0';

fastify.listen({ port, host }, (err, address) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	fastify.log.info(`Server listening at ${address}`);
});
