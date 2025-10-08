import { FullUser, type FullUserType, GetUser, type GetUserType } from '../utils/api/service/db/user.js';
import { AuthClientRequest, type AuthClientRequestType } from '../utils/api/service/common/clientRequest.js';
import type { CreateUserType } from '../utils/api/service/auth/createUser.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { LoginUserType } from '../utils/api/service/auth/loginUser.js';
import type { ErrorResponseType } from 'utils/api/service/common/error.js';
import { ErrorResponse } from '../utils/api/service/common/error.js';
import { CreateUser } from '../utils/api/service/auth/createUser.js';
import { LoginUser } from '../utils/api/service/auth/loginUser.js';
import { userService } from '../main.js';
import bcrypt from 'bcrypt';
import { z } from 'zod';

const SALT_ROUNDS = 10;

async function hashPassword(plainPassword: string): Promise<string> {
	return await bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
	return await bcrypt.compare(plainPassword, hashedPassword);
}

async function userRoutes(fastify: FastifyInstance) {
	type ListUsersSchema = {
		Reply: {
			200: z.infer<typeof FullUser>[];
		}
	};

	fastify.get<ListUsersSchema>('/', {
		schema: {
			response: {
				200: z.array(FullUser),
			}
		}
	}, async (_, reply) => {
		return reply.status(200).send(userService.fetchAllUsers());
	});

	type ValidateSchema = {
		Body: z.infer<typeof LoginUser>;
		Reply: {
			200: FullUserType;
			401: ErrorResponseType;
			500: ErrorResponseType;
		};
	}

	fastify.post<ValidateSchema>('/validate', {
		schema: {
			body: LoginUser,
			response: {
				200: FullUser, // Valid credentials; return user data
				401: ErrorResponse, // Invalid credentials
				500: ErrorResponse, // Internal server error
			}
		}
	}, async (request, reply) => {
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

	type FetchMeSchema = {
		Body: AuthClientRequestType<z.ZodAny>;
		Reply: {
			200: FullUserType;
			400: ErrorResponseType;
			404: ErrorResponseType;
			500: ErrorResponseType;
		};
	}

	fastify.post<FetchMeSchema>('/me', {
		schema: {
			body: AuthClientRequest(z.any()),
			response: {
				200: FullUser, // Found user
				400: ErrorResponse, // Missing or invalid userId
				404: ErrorResponse, // User not found
				500: ErrorResponse, // Internal server error
			}
		}
	}, async (request, reply) => {
		const { userId } = request.body;
		if (userId === undefined || typeof userId !== 'number' || userId < 1)
			return reply.status(400).send({ message: 'Invalid or missing userId' });

		const userResult = userService.fetchUserById(userId);
		if (userResult.isErr())
			return reply.status(404).send({ message: userResult.unwrapErr() });
		else
			return reply.status(200).send(userResult.unwrap());
	});

	type GetUserSchema = {
		Params: GetUserType;
	};

	fastify.get<GetUserSchema>('/fetch/:userid', {
		schema: {
			params: GetUser,
			response: {
				200: FullUser, // Found user
				404: ErrorResponse, // User not found
			}
		}
	}, async (request, reply) => {
		const { userid } = request.params;
		const userResult = userService.fetchUserById(userid);

		if (userResult.isErr())
			return reply.status(404).send({ error: userResult.unwrapErr() });
		else
			return reply.status(200).send(userResult.unwrap());
	});

	type CreateUserSchema = {
		Body: CreateUserType,
		Reply: {
			201: FullUserType;
			400: ErrorResponseType;
			500: ErrorResponseType;
		};
	}

	fastify.post<CreateUserSchema>('/create/normal', {
		schema: {
			body: CreateUser,
			response: {
				201: FullUser, // Created user
				400: ErrorResponse, // User already exists / Invalid data
				500: ErrorResponse, // Internal server error
			}
		}
	}, async (request, reply) => {
		const { username, email, password } = request.body;
		console.log("Creating user:", username, email);
		
		try {
			const userResult = userService.createNewUser(username, email, await hashPassword(password));

			if (userResult.isErr())
				return reply.status(400).send({ message: userResult.unwrapErr() });

			return reply.status(201).send(userResult.unwrap());
		} catch (error: any) {
			console.error("Error creating user:", error);
			return reply.status(400).send({ message: error.message || 'Internal server error' });
		}
	});

	type CreateGuestSchema = {
		Reply: {
			201: FullUserType;
			500: ErrorResponseType;
		};
	}

	fastify.get<CreateGuestSchema>('/create/guest', {
		schema: {
			response: {
				201: FullUser, // Created guest user
				500: ErrorResponse, // Internal server error
			}
		}
	}, async (_, reply) => {
		const userResult = userService.createNewGuestUser();

		if (userResult.isErr())
			return reply.status(500).send({ message: userResult.unwrapErr() });
		else
			return reply.status(201).send(userResult.unwrap());
	});
}

export default userRoutes;
