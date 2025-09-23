"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const auth_interfaces_js_1 = require("../utils/api/service/auth_interfaces.js");
const fastify_1 = __importStar(require("fastify"));
const database_1 = __importDefault(require("../database"));
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
//# sourceMappingURL=users.js.map