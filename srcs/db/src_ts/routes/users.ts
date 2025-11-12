import { FullUser, type FullUserType, GetUser, type GetUserType } from '../utils/api/service/db/user.js';
import { AuthClientRequest, type AuthClientRequestType } from '../utils/api/service/common/clientRequest.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ErrorResponseType } from '../utils/api/service/common/error.js';
import { type ZodSchema } from '../utils/api/service/common/zodUtils.js';
import { registerRoute } from '../utils/api/service/common/fastify.js';
import { ErrorResponse } from '../utils/api/service/common/error.js';
import { CreateUser } from '../utils/api/service/auth/createUser.js';
import { LoginUser } from '../utils/api/service/auth/loginUser.js';
import { userIdValue } from '../utils/api/service/common/zodRules.js';
import { userService } from '../main.js';
import bcrypt from 'bcrypt';
import { int, z } from 'zod';
import { int_url, pub_url } from '../utils/api/service/common/endpoints.js';
import { request } from 'http';

const SALT_ROUNDS = 10;

export async function hashPassword(plainPassword: string): Promise<string> {
	return await bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
	return await bcrypt.compare(plainPassword, hashedPassword);
}

async function userRoutes(fastify: FastifyInstance) {
	registerRoute(fastify, int_url.http.db.fetchMultipleUsers, async (request, reply) => {
		const requestedUsers: number[] = request.body;
		const usersResult = userService.fetchAllUsers();
		if (usersResult.isErr())
			return reply.status(500).send({ message: usersResult.unwrapErr() });
		else {
			const allUsers = usersResult.unwrap();
			const filteredUsers = allUsers.filter((user) => requestedUsers.includes(user.id));
			return reply.status(200).send(filteredUsers);
		}
	});

	registerRoute(fastify, int_url.http.db.loginUser, async (request, reply) => {
		const { username, password } = request.body;
		const userResult = userService.fetchUserFromUsername(username);
		if (userResult.isErr())
			return reply.status(401).send({ message: userResult.unwrapErr() });

		const user = userResult.unwrap();
		if (user.isGuest)
			return reply.status(401).send({ message: 'You cannot login as a guest user' });

		if (!await verifyPassword(password, user.passwordHash || ''))
			return reply.status(401).send({ message: 'Invalid password' });

		const outUser = userService.fetchUserById(user.id);
		if (outUser.isErr())
			return reply.status(500).send({ message: outUser.unwrapErr() });

		return reply.status(200).send(outUser.unwrap());
	});

	registerRoute(fastify, int_url.http.db.getUser, async (request, reply) => {
		const { userId } = request.params;
		const userResult = userService.fetchUserById(userId);

		if (userResult.isErr())
			return reply.status(404).send({ message: userResult.unwrapErr() });
		else
			return reply.status(200).send(userResult.unwrap());
	});

	registerRoute(fastify, int_url.http.db.createNormalUser, async (request, reply) => {
		const { username, email, password } = request.body;
		console.log("Creating user:", username, email);
		
		const userResult = await userService.createNewUser(username, email, await hashPassword(password), false);

		if (userResult.isErr())
			return reply.status(400).send({ message: userResult.unwrapErr() });

		return reply.status(201).send(userResult.unwrap());
	});

	registerRoute(fastify, int_url.http.db.createGuestUser, async (request, reply) => {
		const userResult = await userService.createNewGuestUser();

		if (userResult.isErr())
			return reply.status(500).send({ message: userResult.unwrapErr() });
		else
			return reply.status(201).send(userResult.unwrap());
	});

	registerRoute(fastify, int_url.http.db.getUserPfp, async (request, reply) => {
		const { userId } = request.params;
		const avatarResult = await userService.fetchUserAvatar(userId);

		if (avatarResult.isErr())
			return reply.status(404).send({ message: avatarResult.unwrapErr() });
		else {
			reply.header('Content-Type', 'image/svg+xml');
			return reply.status(200).send(avatarResult.unwrap());
		}
	});

	registerRoute(fastify, int_url.http.db.fetchUserConnections, async (request, reply) => {
		const { userId } = request.params;
		const connectionsResult = userService.fetchUserFriendlist(userId);

		if (connectionsResult.isErr())
			return reply.status(500).send({ message: connectionsResult.unwrapErr() });
		else
			return reply.status(200).send(connectionsResult.unwrap());
	});

	registerRoute(fastify, int_url.http.db.updateUserConnectionStatus, async (request, reply) => {
		let results = [];

		for (const item of request.body) {
			const { userId, friendId, status } = item;
			const updateResult = userService.updateMutualUserConnection(userId, friendId, status);
			results.push(updateResult);
		}

		if (results.some((result) => result.isErr()))
			return reply.status(400).send({ message: results.find((result) => result.isErr())?.unwrapErr() || "Unknown Error" });
		else
			return reply.status(200).send(null);
	});
}

export default userRoutes;
