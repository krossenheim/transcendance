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
const auth_interfaces_js_1 = require("./utils/api/service/auth_interfaces.js");
const fastify_1 = __importStar(require("fastify"));
const axios_1 = __importDefault(require("axios"));
const fastify = (0, fastify_1.default)({ logger: true });
const secretKey = "shgdfkjwriuhfsdjkghdfjvnsdk";
fastify.post('/api/login', {
    schema: {
        body: auth_interfaces_js_1.LoginRequestBodySchema
    }
}, async (request, reply) => {
    const { username, password } = request.body;
    try {
        let response;
        try {
            response = await axios_1.default.post(`http://database_service:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS}/api/users/validate`, { username, password });
        }
        catch (err) {
            if (response && response.status === 401) {
                return reply.status(401).send({ error: 'Invalid credentials' });
            }
            throw err;
        }
        console.log(`Login attempt for user: ${username}`);
        return reply.status(200).send({ message: 'Login successful' });
    }
    catch (error) {
        console.error('Error validating user credentials:', error);
        return reply.status(500).send({ error: 'User service unavailable' });
    }
});
const port = parseInt(process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || '3000', 10);
const host = process.env.AUTH_BIND_TO || '0.0.0.0';
fastify.listen({ port, host }, (err, address) => {
    if (err) {
        fastify.log.error(err);
        process.exit(1);
    }
    fastify.log.info(`Server listening at ${address}`);
});
//# sourceMappingURL=main.js.map