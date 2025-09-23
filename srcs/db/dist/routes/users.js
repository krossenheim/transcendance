"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const auth_interfaces_js_1 = require("../utils/api/service/auth_interfaces.js");
const fastify_1 = __importDefault(require("fastify"));
const fastify = (0, fastify_1.default)({ logger: true });
async function userRoutes(fastify, options) {
    fastify.get('/users', async (request, reply) => {
        console.log(request);
        console.log(1);
        return reply.status(200).send(options.database.fetchAllUsers());
    });
    fastify.post('/validate', {
        schema: {
            body: auth_interfaces_js_1.LoginRequestBodySchema
        }
    }, async (request, reply) => {
        const { username, password } = request.body;
        if (!username || !password) {
            return reply.status(400).send({ error: 'Username and password are required' });
        }
        const user = options.database.fetchUserFromCredentials(username, password);
        if (user) {
            return { success: true, user: user };
        }
        else {
            return reply.status(401).send({ success: false, error: 'Invalid credentials' });
        }
    });
    fastify.get('/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                },
                required: ['id'],
            },
        }
    }, async (request, reply) => {
        const id = parseInt(request.params.id);
        const user = options.database.fetchUserById(id);
        if (user) {
            return user;
        }
        else {
            reply.status(404).send({ error: 'User not found' });
        }
    });
    fastify.post('/create', {
        schema: {
            body: auth_interfaces_js_1.CreateAccountRequestBodySchema
        }
    }, async (request, reply) => {
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
exports.default = userRoutes;
