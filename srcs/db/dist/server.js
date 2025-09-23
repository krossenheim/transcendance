"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const users_js_1 = __importDefault(require("./routes/users.js"));
const database_1 = __importDefault(require("./database"));
const fastify_1 = __importDefault(require("fastify"));
const fastify = (0, fastify_1.default)({ logger: true });
const db = new database_1.default('/etc/database_data/users.db');
fastify.register(users_js_1.default, { prefix: '/api/users', database: db });
const port = parseInt(process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || '3000', 10);
const host = process.env.AUTH_BIND_TO || '0.0.0.0';
fastify.listen({ port, host }, (err, address) => {
    if (err) {
        fastify.log.error(err);
        process.exit(1);
    }
    fastify.log.info(`Server listening at ${address}`);
});
