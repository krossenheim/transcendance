"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// const fastify = require('fastify')({ logger: true });
const fastify_1 = __importDefault(require("fastify"));
const database_js_1 = __importDefault(require("./database.js"));
const fastify = (0, fastify_1.default)({ logger: true });
const db = new database_js_1.default('/etc/database_data/users.db');
const users_js_1 = __importDefault(require("./routes/users.js"));
fastify.register(users_js_1.default, { prefix: '/api/users', database: db });
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
