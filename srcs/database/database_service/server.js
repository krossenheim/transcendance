const fastify = require('fastify')({ logger: true });

const Database = require('./database');
const db = new Database('/etc/database_data/users.db');

fastify.register(require('./routes/users.js'), { prefix: '/api/users', database: db });

fastify.listen({ port: 3000 }, (err, address) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	fastify.log.info(`Server listening at ${address}`);
});
