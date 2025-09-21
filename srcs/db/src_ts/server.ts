import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

const Database = require('./database');
const db = new Database('/etc/database_data/users.db');

fastify.register(require('./routes/users.js'), { prefix: '/api/users', database: db });

fastify.listen({ port: process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS, host: process.env.DATABASE_BIND_TO }, (err, address) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	fastify.log.info(`Server listening at ${address}`);
});
