import { FullUser, type FullUserType, GetUser, type GetUserType } from '../utils/api/service/db/user.js';
import { AuthClientRequest, type AuthClientRequestType } from '../utils/api/service/common/clientRequest.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ErrorResponseType } from '../utils/api/service/common/error.js';
import { type ZodSchema } from '../utils/api/service/common/zodUtils.js';
import { ErrorResponse } from '../utils/api/service/common/error.js';
import { CreateUser } from '../utils/api/service/auth/createUser.js';
import { LoginUser } from '../utils/api/service/auth/loginUser.js';
import { userIdValue } from '../utils/api/service/common/zodRules.js';
import { userService } from '../main.js';
import bcrypt from 'bcrypt';
import { int, z } from 'zod';
import {  int_url } from '../utils/api/service/common/endpoints.js';

const SALT_ROUNDS = 10;

async function hashPassword(plainPassword: string): Promise<string> {
	return await bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
	return await bcrypt.compare(plainPassword, hashedPassword);
}

async function userRoutes(fastify: FastifyInstance) {
	const listUsersSchema = {
		response: {
			200: z.array(FullUser),
			500: ErrorResponse,
		}
	}

	fastify.get<ZodSchema<typeof listUsersSchema>>(
		int_url.http.db.listUsers,
		{ schema: listUsersSchema },
		async (_, reply) => {
			const usersResult = userService.fetchAllUsers();
			if (usersResult.isErr())
				return reply.status(500).send({ message: usersResult.unwrapErr() });
			else
				return reply.status(200).send(usersResult.unwrap());
		}
	);

	const loginUserSchema = {
		body: LoginUser,
		response: {
			200: FullUser, // Successful login; return user data
			401: ErrorResponse, // Invalid username or password
			500: ErrorResponse, // Internal server error
		}
	};

	fastify.post<ZodSchema<typeof loginUserSchema>>(
		int_url.http.db.loginUser,
		{ schema: loginUserSchema },
		async (request, reply) => {
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
		}
	);

	const fetchMeSchema = {
		body: AuthClientRequest(z.any()),
		response: {
			200: FullUser, // Found user
			400: ErrorResponse, // Missing or invalid userId
			404: ErrorResponse, // User not found
			500: ErrorResponse, // Internal server error
		}
	};

	fastify.post<ZodSchema<typeof fetchMeSchema>>(
		int_url.http.db.fetchMe,
		{ schema: fetchMeSchema },
		async (request, reply) => {
			const { userId } = request.body;
			if (userId === undefined || typeof userId !== 'number' || userId < 1)
				return reply.status(400).send({ message: 'Invalid or missing userId' });

			const userResult = userService.fetchUserById(userId);
			if (userResult.isErr())
				return reply.status(404).send({ message: userResult.unwrapErr() });
			else
				return reply.status(200).send(userResult.unwrap());
		}
	);

	const fetchUserSchema = {
		params: GetUser,
		response: {
			200: FullUser, // Found user
			404: ErrorResponse, // User not found
		}
	};

	fastify.get<ZodSchema<typeof fetchUserSchema>>(
		int_url.http.db.getUser,
		{ schema: fetchUserSchema },
		async (request, reply) => {
			const { userId } = request.params;
			const userResult = userService.fetchUserById(userId);

			if (userResult.isErr())
				return reply.status(404).send({ message: userResult.unwrapErr() });
			else
				return reply.status(200).send(userResult.unwrap());
		}
	);

	const createUserSchema = {
		body: CreateUser,
		response: {
			201: FullUser, // Created user
			400: ErrorResponse, // User already exists / Invalid data
		}
	}

	fastify.post<ZodSchema<typeof createUserSchema>>(
		int_url.http.db.createNormalUser,
		{ schema: createUserSchema },
		async (request, reply) => {
			const { username, email, password } = request.body;
			console.log("Creating user:", username, email);
			
			const userResult = await userService.createNewUser(username, email, await hashPassword(password), false);

			if (userResult.isErr())
				return reply.status(400).send({ message: userResult.unwrapErr() });

			return reply.status(201).send(userResult.unwrap());
		}
	);

	const createGuestSchema = {
		response: {
			201: FullUser, // Created guest user
			500: ErrorResponse, // Internal server error
		}
	};

	fastify.get<ZodSchema<typeof createGuestSchema>>(
		int_url.http.db.createGuestUser,
		{ schema: createGuestSchema },
		async (_, reply) => {
			const userResult = await userService.createNewGuestUser();

			if (userResult.isErr())
				return reply.status(500).send({ message: userResult.unwrapErr() });
			else
				return reply.status(201).send(userResult.unwrap());
		}
	);

	const UserIdSchema = z.object({ userId: userIdValue });

	// type FetchUserPfpSchema = {
	// 	Body: AuthClientRequestType<typeof UserIdSchema>;
	// 	Reply: {
	// 		200: string;
	// 		404: ErrorResponseType;
	// 	};
	// }

	// fastify.post<FetchUserPfpSchema>('/pfp', {
	// 	schema: {
	// 		body: AuthClientRequest(UserIdSchema),
	// 		response: {
	// 			200: z.string(), // Found avatar
	// 			404: ErrorResponse, // Avatar not found
	// 		}
	// 	}
	// }, async (request, reply) => {
	// 	const { userId } = request.body.payload;
	// 	const avatarResult = await userService.fetchUserAvatar(userId);

	// 	if (avatarResult.isErr())
	// 		return reply.status(404).send({ message: avatarResult.unwrapErr() });
	// 	else
	// 		reply.header('Content-Type', 'image/svg+xml');
	// 		return reply.status(200).send(avatarResult.unwrap());
	// });
}

export default userRoutes;
