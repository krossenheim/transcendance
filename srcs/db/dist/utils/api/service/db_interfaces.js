"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const GameResultSchema = zod_1.z.object({
    id: zod_1.z.number(),
    userId: zod_1.z.number(),
    score: zod_1.z.number(),
    rank: zod_1.z.number(),
});
const UserSchema = zod_1.z.object({
    id: zod_1.z.number(),
    createdAt: zod_1.z.number(),
    username: zod_1.z.string(),
    email: zod_1.z.string(),
});
const FullUserSchema = UserSchema.extend({
    gameResults: zod_1.z.array(GameResultSchema),
});
exports.default = {
    GameResultSchema,
    UserSchema,
    FullUserSchema,
};
