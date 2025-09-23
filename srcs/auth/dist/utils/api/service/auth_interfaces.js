"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateAccountRequestBodySchema = exports.LoginRequestBodySchema = void 0;
const zod_1 = require("zod");
exports.LoginRequestBodySchema = zod_1.z.object({
    username: zod_1.z.string(),
    password: zod_1.z.string(),
});
exports.CreateAccountRequestBodySchema = zod_1.z.object({
    username: zod_1.z.string(),
    email: zod_1.z.email(),
    password: zod_1.z.string(),
});
