import { UserAccountType, type UserAuthDataType } from '@app/shared/api/service/db/user';
import { registerRoute } from '@app/shared/api/service/common/fastify';
import { int_url } from '@app/shared/api/service/common/endpoints';

import type { FastifyInstance } from 'fastify';
import { userService } from '../main.js';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(plainPassword: string): Promise<string> {
	return await bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
	return await bcrypt.compare(plainPassword, hashedPassword);
}

function isUserAllowedToLogin(user: UserAuthDataType): boolean {
	return user.accountType === UserAccountType.User;
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
		const userResult = userService.fetchAuthUserDataFromUsername(username);
		if (userResult.isErr())
			return reply.status(401).send({ message: userResult.unwrapErr() });

		const user = userResult.unwrap();
		if (!isUserAllowedToLogin(user))
			return reply.status(401).send({ message: 'You are not allowed to login' });

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

	registerRoute(fastify, int_url.http.db.searchUserByUsername, async (request, reply) => {
		const { username } = request.params;
		const userResult = userService.fetchUserFromUsername(username);

		if (userResult.isErr())
			return reply.status(404).send({ message: userResult.unwrapErr() });
		else
			return reply.status(200).send(userResult.unwrap());
	});

	registerRoute(fastify, int_url.http.db.createNormalUser, async (request, reply) => {
		const { username, email, password } = request.body;
		console.log("Creating user:", username, email);
		
		const userResult = await userService.createNewUser(username, email, await hashPassword(password), UserAccountType.User);

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
		const { file } = request.body;
		const avatarResult = await userService.fetchUserAvatar(file);

		if (avatarResult.isErr())
			return reply.status(404).send({ message: avatarResult.unwrapErr() });
		else {
			reply.type('data:image/png;base64');
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

	registerRoute(fastify, int_url.http.db.updateUserData, async (request, reply) => {
		const { userId, bio, alias, email, pfp } = request.body;
		const updateResult = await userService.updateUserData(userId, bio, alias, email, pfp);

		if (updateResult.isErr())
			return reply.status(400).send({ message: updateResult.unwrapErr() });
		else
			return reply.status(200).send(updateResult.unwrap());
	});

	// GDPR: anonymize user data
	registerRoute(fastify, int_url.http.db.anonymizeUser, async (request, reply) => {
		const { userId } = request.params;
		const anonResult = await userService.anonymizeUser(userId);

		if (anonResult.isErr())
			return reply.status(400).send({ message: anonResult.unwrapErr() });
		else
			return reply.status(200).send(anonResult.unwrap());
	});

	// GDPR: delete user account and associated data
	registerRoute(fastify, int_url.http.db.deleteUser, async (request, reply) => {
		const { userId } = request.params;
		const delResult = await userService.deleteUser(userId);

		if (delResult.isErr())
			return reply.status(400).send({ message: delResult.unwrapErr() });
		else
			return reply.status(200).send(null);
	});

	registerRoute(fastify, int_url.http.db.fetchUserGameResults, async (request, reply) => {
		const { userId } = request.params;
		const userResult = userService.fetchUserById(userId);
		if (userResult.isErr())
			return reply.status(404).send({ message: userResult.unwrapErr() });
		const gameResults = userService.fetchUserGameResults(userId);
		if (gameResults.isErr())
			return reply.status(500).send({ message: gameResults.unwrapErr() });
		return reply.status(200).send(gameResults.unwrap());
	});
}

export default userRoutes;
