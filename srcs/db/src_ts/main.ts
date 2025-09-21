// const fastify = require('fastify')({ logger: true });
import Fastify from 'fastify';
import Database from './database.js';

const fastify = Fastify({ logger: true });
const db = new Database('/etc/database_data/users.db');

import userRoutes from './routes/users.js';
fastify.register(userRoutes, { prefix: '/api/users', database: db });

// fastify.register(async function (fastify) {
// 	fastify.route({
// 		method: 'POST',
// 		url: '/api/create',
// 		handler: (req, reply) => {
// 			const { username, email, password } = req.body;
// 			if (!username || !email || !password) {
// 				return reply.status(400).send({ error: 'Username, email, and password are required' });
// 			} else {
// 				console.log("Creating user:", username, email);
// 				const user = db.createNewUser(username, email, password);
// 				return reply.status(201).send(user);
// 			}
// 		},
// 	});
// });

fastify.listen({ port: process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS, host: process.env.DATABASE_BIND_TO }, (err, address) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	fastify.log.info(`Server listening at ${address}`);
});
