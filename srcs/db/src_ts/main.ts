// const fastify = require('fastify')({ logger: true });
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply, FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import Database from './database';

const zodFastify = (
	options: FastifyServerOptions = { logger: true }
) => {
	const server = Fastify(options);
	server.setValidatorCompiler(validatorCompiler);
	server.setSerializerCompiler(serializerCompiler);
	return server;
}

const fastify: FastifyInstance = zodFastify();
const db = new Database('/etc/database_data/users.db');

import userRoutes from './routes/users';
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

const port = parseInt(process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || '3000', 10);
const host = process.env.AUTH_BIND_TO || '0.0.0.0';

fastify.listen({ port, host }, (err, address) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	fastify.log.info(`Server listening at ${address}`);
});
