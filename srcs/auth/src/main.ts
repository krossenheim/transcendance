'use strict'
import { StoreTokenPayload, VerifyTokenPayload } from '@app/shared/api/service/db/token';
import { registerRoute, createFastify } from '@app/shared/api/service/common/fastify';
import { int_url, pub_url, user_url } from '@app/shared/api/service/common/endpoints';
import { TokenPayload } from '@app/shared/api/service/auth/tokenData';
import { ErrorResponse } from '@app/shared/api/service/common/error';
import { Result } from '@app/shared/api/service/common/result';
import { FullUser } from '@app/shared/api/service/db/user';
import containers from '@app/shared/internal_api'

import type { ErrorResponseType } from '@app/shared/api/service/common/error';
import type { TokenDataType } from '@app/shared/api/service/auth/tokenData';
import type { FullUserType } from '@app/shared/api/service/db/user';
import type { FastifyInstance } from 'fastify';

import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';

// Temporary storage for pending 2FA logins (in production, use Redis)
const pending2FALogins = new Map<string, { userId: number; timestamp: number }>();

// Clean up expired temp tokens every 5 minutes
setInterval(() => {
	const now = Date.now();
	for (const [token, data] of pending2FALogins.entries()) {
		if (now - data.timestamp > 5 * 60 * 1000) { // 5 minutes
			pending2FALogins.delete(token);
		}
	}
}, 5 * 60 * 1000);

const fastify: FastifyInstance = createFastify({ logger: true } as any);

// Attach cookie consent to each request: true when cookie_consent === 'accepted'
fastify.addHook('preHandler', async (request, reply) => {
	// `request.cookies` is provided by @fastify/cookie (registered in createFastify)
	const consentCookie = (request as any).cookies?.cookie_consent;
	const headerConsent = (request.headers['x-cookie-consent'] as string | undefined) || null;
	(request as any).cookieConsent = (consentCookie === 'accepted') || (headerConsent === 'accepted');

	// Temporary debug logging: print Authorization and headers for GDPR and avatar requests
	try {
		const url = (request as any).url || request.url || '';
		if (typeof url === 'string' && (url.startsWith('/api/auth/gdpr') || url.startsWith('/api/users/pfp'))) {
			console.log('[auth][incoming request]', { url, method: request.method, authorization: request.headers['authorization'], headers: request.headers });
		}
	} catch (e) {
		// ignore logging failures
	}
});

// JWT Secret - logs warning if using default (for development only)
if (!process.env.JWT_SECRET) {
	console.warn('WARNING: JWT_SECRET not set, using insecure default - DO NOT USE IN PRODUCTION');
}
const jwtSecretKey = process.env.JWT_SECRET || "shgdfkjwriuhfsdjkghdfjvnsdk";
const jwtExpiry = '15min'; // 15 min

// Frontend URL for OAuth redirects - should be set via environment variable in production
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://localhost';

// OAuth state management
const pendingOAuthStates = new Map<string, number>();
setInterval(() => {
	const now = Date.now();
	for (const [state, ts] of pendingOAuthStates.entries()) {
		if (now - ts > 10 * 60 * 1000) pendingOAuthStates.delete(state);
	}
}, 5 * 60 * 1000);

async function generateToken(userId: number): Promise<Result<TokenDataType, ErrorResponseType>> {
	const newRefreshToken = randomBytes(64).toString('hex');

	const response = await containers.db.post(int_url.http.db.storeToken, StoreTokenPayload.parse({
		userId: userId,
		token: newRefreshToken,
	}));

	if (response.isErr())
		return Result.Err({ message: 'Token service unreachable' });

	if (response.unwrap().status !== 200)
		return Result.Err({ message: 'Token service could not process request' });

	return Result.Ok({
		jwt: jwt.sign(TokenPayload.parse({ uid: userId }), jwtSecretKey, { expiresIn: jwtExpiry }),
		refresh: newRefreshToken,
	});
}

function validateToken(token: string): Result<number, string> {
	let decoded: { uid: number; iat: number; exp: number; };
	try {
		decoded = jwt.verify(token, jwtSecretKey) as { uid: number; iat: number; exp: number; };
	} catch (err) {
		return Result.Err('Invalid JWT');
	}

	if (typeof decoded.exp !== 'number' || Date.now() >= decoded.exp * 1000) {
		return Result.Err('JWT expired');
	}

	if (typeof decoded.uid !== 'number' || decoded.uid < 1)
		return Result.Err('Invalid JWT payload');
	else
		return Result.Ok(decoded.uid);
}

registerRoute(fastify, pub_url.http.auth.loginUser, async (request, reply) => {
	const responseResult = await containers.db.post(int_url.http.db.loginUser, {
		username: request.body.username,
		password: request.body.password,
	});

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	console.log("Response from user service:", response.status, response.data);
	if (response.status === 401) {
		return reply.status(401).send({ message: 'Invalid credentials' });
	}

	const parse = FullUser.safeParse(response.data);
	if (response.status !== 200 || !parse.success) {
		console.error('Unexpected response from user service:', response.status, response.data);
		console.error('Parsing error:', parse.error);
		console.log('Response data: ', response.data);
		return reply.status(500).send({ message: 'User service dropping agreement' });
	}

	const user: FullUserType = parse.data;

	// Check if user has 2FA enabled
	if (user.has2FA) {
		// Generate temporary token for 2FA verification
		const tempToken = randomBytes(32).toString('hex');
		pending2FALogins.set(tempToken, {
			userId: user.id,
			timestamp: Date.now(),
		});

		// TypeScript narrowing - cast reply to any to send 2FA response
		return (reply as any).status(200).send({
			requires2FA: true,
			userId: user.id,
			tempToken: tempToken,
		});
	}

	// No 2FA required, proceed with normal login
	const tokenResult = await generateToken(user.id);

	if (tokenResult.isOk())
		return reply.status(200).send({ user, tokens: tokenResult.unwrap() });
	else
		return reply.status(500).send(tokenResult.unwrapErr());
});

// GitHub OAuth: Start login (redirect to GitHub)
fastify.get('/public_api/auth/oauth/github/login', async (request, reply) => {
	const clientId = process.env.GITHUB_CLIENT_ID;
	const redirectUri = process.env.GITHUB_REDIRECT_URI;
	const scope = process.env.GITHUB_OAUTH_SCOPE || 'read:user user:email';

	if (!clientId || !redirectUri) {
		return reply.status(500).send({ message: 'GitHub OAuth is not configured' });
	}

	const state = randomBytes(20).toString('hex');
	pendingOAuthStates.set(state, Date.now());

	const authUrl = new URL('https://github.com/login/oauth/authorize');
	authUrl.searchParams.set('client_id', clientId);
	authUrl.searchParams.set('redirect_uri', redirectUri);
	authUrl.searchParams.set('scope', scope);
	authUrl.searchParams.set('state', state);

	return reply.redirect(authUrl.toString());
});

// GitHub OAuth: Callback handler
fastify.get('/public_api/auth/oauth/github/callback', async (request, reply) => {
	try {
		const query = request.query as Record<string, string | string[]>;
		console.log('OAuth callback query:', JSON.stringify(query));
		const code = Array.isArray(query.code) ? query.code[0] : query.code;
		const state = Array.isArray(query.state) ? query.state[0] : query.state;
		console.log('Parsed code:', code, 'state:', state);
		console.log('Pending states:', Array.from(pendingOAuthStates.keys()));

		if (!code || !state) {
			return reply.status(400).send({ message: 'Missing OAuth code or state' });
		}

		const stateTime = pendingOAuthStates.get(state);
		if (!stateTime || Date.now() - stateTime > 10 * 60 * 1000) {
			return reply.status(400).send({ message: 'Invalid or expired OAuth state' });
		}
		pendingOAuthStates.delete(state);

		const clientId = process.env.GITHUB_CLIENT_ID || '';
		const clientSecret = process.env.GITHUB_CLIENT_SECRET || '';
		const redirectUri = process.env.GITHUB_REDIRECT_URI || '';

		if (!clientId || !clientSecret || !redirectUri) {
			return reply.status(500).send({ message: 'GitHub OAuth is not configured' });
		}

		// Exchange code for access token
		console.log('Exchanging code for token with:', { clientId: clientId.substring(0, 8) + '...', redirectUri, code: code.substring(0, 8) + '...' });
		const tokenResp = await axios.post(
			'https://github.com/login/oauth/access_token',
			{
				client_id: clientId,
				client_secret: clientSecret,
				code,
				redirect_uri: redirectUri,
				state,
			},
			{ headers: { Accept: 'application/json' }, validateStatus: () => true }
		);

		console.log('GitHub token response:', tokenResp.status, JSON.stringify(tokenResp.data));
		if (tokenResp.status !== 200 || !tokenResp.data?.access_token) {
			return reply.status(401).send({ message: 'Failed to obtain GitHub token' });
		}

		const accessToken = tokenResp.data.access_token as string;

		// Fetch user profile
		const userResp = await axios.get('https://api.github.com/user', {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: 'application/vnd.github+json',
			},
			validateStatus: () => true,
		});

		if (userResp.status !== 200 || !userResp.data?.login) {
			return reply.status(401).send({ message: 'Failed to fetch GitHub user' });
		}

		const ghLogin = String(userResp.data.login);
		const ghAvatar = String(userResp.data.avatar_url || '');

		// Fetch primary email
		let email: string | null = null;
		try {
			const emailsResp = await axios.get('https://api.github.com/user/emails', {
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: 'application/vnd.github+json',
				},
				validateStatus: () => true,
			});
			if (emailsResp.status === 200 && Array.isArray(emailsResp.data)) {
				const primary = emailsResp.data.find((e: any) => e.primary && e.verified);
				email = (primary?.email as string) || null;
			}
		} catch (_) {
			// ignore; fallback below
		}
		if (!email) email = `${ghLogin}@users.noreply.github.com`;

		// Find or create user in DB
		const existingResult = await containers.db.fetchUserByUsername(ghLogin, true);
		if (existingResult.isOk()) {
			const user = existingResult.unwrap();
			const tokens = await generateToken(user.id);
			if (tokens.isErr()) return reply.status(500).send(tokens.unwrapErr());
			const tokenData = tokens.unwrap();
			// Use URL fragment (hash) instead of query params to prevent tokens from being logged in server access logs
			const redirectUrl = `${FRONTEND_URL}/#jwt=${encodeURIComponent(tokenData.jwt)}&refresh=${encodeURIComponent(tokenData.refresh || '')}`;
			return reply.redirect(redirectUrl);
		}

		// Create new user with random password
		const randomPassword = randomBytes(24).toString('hex');
		const createResp = await containers.db.post(int_url.http.db.createNormalUser, {
			username: ghLogin,
			email,
			password: randomPassword,
		});

		if (createResp.isErr()) {
			return reply.status(500).send({ message: createResp.unwrapErr() });
		}
		if (createResp.unwrap().status !== 201) {
			return reply.status(createResp.unwrap().status as 400).send(createResp.unwrap().data);
		}

		const newUser = FullUser.parse(createResp.unwrap().data);

		// Optionally set avatar/email via updateUserData
		try {
			// Update basic profile fields
			await containers.db.post(int_url.http.db.updateUserData, {
				userId: newUser.id,
				bio: newUser.bio ?? '',
				alias: newUser.alias ?? ghLogin,
				email: email,
			});

			// Fetch GitHub avatar and store as base64 pfp
			if (ghAvatar) {
				const avatarResp = await axios.get(ghAvatar, {
					responseType: 'arraybuffer',
					validateStatus: () => true,
				});
				if (avatarResp.status === 200) {
					const contentType = String(avatarResp.headers['content-type'] || 'image/jpeg');
					const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
					const base64 = Buffer.from(avatarResp.data).toString('base64');
					await containers.db.post(int_url.http.db.updateUserData, {
						userId: newUser.id,
						pfp: {
							filename: `github_avatar.${ext}`,
							data: base64,
						},
					});
				}
			}
		} catch (_) {
			console.warn('Failed to set GitHub avatar:', _);
		}

		const tokens = await generateToken(newUser.id);
		if (tokens.isErr()) return reply.status(500).send(tokens.unwrapErr());
		
		// Use URL fragment (hash) instead of query params to prevent tokens from being logged
		const tokenData = tokens.unwrap();
		const redirectUrl = `${FRONTEND_URL}/#jwt=${encodeURIComponent(tokenData.jwt)}&refresh=${encodeURIComponent(tokenData.refresh || '')}`;
		return reply.redirect(redirectUrl);
	} catch (err: unknown) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		console.error('OAuth error:', errorMessage);
		return reply.status(500).send({ message: 'OAuth processing failed' });
	}
});

registerRoute(fastify, pub_url.http.auth.createNormalUser, async (request, reply) => {
	const responseResult = await containers.db.post(int_url.http.db.createNormalUser, request.body);

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}
	const response = responseResult.unwrap();
	console.log("Response from user service:", response.status, response.data);

	if (response.status === 400) {
		return reply.status(400).send({ message: 'Invalid user data or user already exists' });
	}

	const parse = FullUser.safeParse(response.data);
	if (response.status !== 201 || !parse.success) {
		console.error('Unexpected response from user service:', response.status, response.data);
		console.error('Parsing error:', parse.error);
		return reply.status(500).send({ message: 'User service dropping agreement' });
	}

	const user: FullUserType = parse.data;
	const tokens = await generateToken(user.id);

	if (tokens.isOk())
		return reply.status(201).send({ user, tokens: tokens.unwrap() });
	else
		return reply.status(500).send(tokens.unwrapErr());
});

registerRoute(fastify, pub_url.http.auth.createGuestUser, async (request, reply) => {
	const responseResult = await containers.db.get(int_url.http.db.createGuestUser);

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}
	const response = responseResult.unwrap();
	console.log("Response from user service:", response.status, response.data);

	const newUserParse = FullUser.safeParse(response.data);
	if (response.status !== 201 || !newUserParse.success) {
		console.error('Unexpected response from user service:', response.status, response.data);
		if (!newUserParse.success)
			console.error('Parsing error:', newUserParse.error);
		return reply.status(500).send({ message: 'User service dropping agreement' });
	}

	const newUser: FullUserType = newUserParse.data;
	const tokens = await generateToken(newUser.id);

	if (tokens.isErr())
		return reply.status(500).send(tokens.unwrapErr());
	else
		return reply.status(201).send({ user: newUser, tokens: tokens.unwrap() });
});

registerRoute(fastify, pub_url.http.auth.validateToken, async (request, reply) => {
	const validation = validateToken(request.body.token);
	if (validation.isErr())
		return reply.status(401).send({ message: validation.unwrapErr() });
	else
		return reply.status(200).send(validation.unwrap());
});

registerRoute(fastify, pub_url.http.auth.refreshToken, async (request, reply) => {
	const responseResult = await containers.db.post(int_url.http.db.validateToken, VerifyTokenPayload.parse({
		token: request.body.token,
	}));

	if (responseResult.isErr())
		return reply.status(500).send({ message: responseResult.unwrapErr() });

	const response = responseResult.unwrap();
	if (response.status === 200) {
		const userParse = FullUser.parse(response.data);
		const newToken = await generateToken(userParse.id);
		if (newToken.isOk())
			return reply.status(200).send({ user: userParse, tokens: newToken.unwrap() });
		else
			return reply.status(500).send(newToken.unwrapErr());
	}

	if (response.status === 401)
		return reply.status(401).send({ message: 'Invalid refresh token' });

	return reply.status(500).send(ErrorResponse.parse(response.data));
});

registerRoute(fastify, user_url.http.auth.logoutUser, async (request, reply) => {
	const responseResult = await containers.db.post(int_url.http.db.logoutUser, {
		userId: request.body.userId,
	});

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	if (response.status === 200) {
		return reply.status(200).send(null);
	} else {
		return reply.status(500).send({ message: 'Failed to log out' });
	}
});

// GDPR: fetch personal data (requires auth wrapper on client side)
registerRoute(fastify, user_url.http.auth.fetchPersonalData, async (request, reply) => {
	const { userId } = request.body;
	const responseResult = await containers.db.get(int_url.http.db.getUser, { userId });

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	if (response.status === 200) {
		const parse = FullUser.safeParse(response.data);
		if (!parse.success) return reply.status(500).send({ message: 'DB returned malformed user data' });
		return reply.status(200).send(parse.data);
	}

	return reply.status(500).send(response.data);
});

// GDPR: request anonymization of personal data
registerRoute(fastify, user_url.http.auth.requestAnonymize, async (request, reply) => {
	const { userId } = request.body;
	const responseResult = await containers.db.post(int_url.http.db.anonymizeUser as any, null as any, { userId });

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	if (response.status === 200) {
		const parse = FullUser.safeParse(response.data);
		if (!parse.success) return reply.status(500).send({ message: 'DB returned malformed user data' });
		return reply.status(200).send(parse.data);
	}

	if (response.status === 400) return reply.status(400).send(response.data);
	return reply.status(500).send(response.data);
});

// GDPR: request account deletion (permanent)
registerRoute(fastify, user_url.http.auth.requestAccountDeletion, async (request, reply) => {
	const { userId } = request.body;
	const responseResult = await containers.db.post(int_url.http.db.deleteUser as any, null as any, { userId });

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	if (response.status === 200) {
		return reply.status(200).send(null);
	}

	if (response.status === 400) return reply.status(400).send(response.data);
	return reply.status(500).send(response.data);
});

// 2FA Setup: Generate QR code
registerRoute(fastify, pub_url.http.auth.setup2FA, async (request, reply) => {
	const { userId, username } = request.body;

	const responseResult = await containers.db.post(int_url.http.db.generate2FASecret, {
		userId,
		username,
	});

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	switch (response.status) {
	case 200:
		return reply.status(200).send(response.data);
	default:
		return reply.status(500).send({ message: 'Failed to generate 2FA secret' });
	}
});

// 2FA Enable: Verify code and enable 2FA
registerRoute(fastify, pub_url.http.auth.enable2FA, async (request, reply) => {
	const { userId, code } = request.body;

	const responseResult = await containers.db.post(int_url.http.db.enable2FA, {
		userId,
		code,
	});

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	if (response.status === 200) {
		return reply.status(200).send(response.data);
	} else if (response.status === 400) {
		return reply.status(400).send(response.data);
	} else {
		return reply.status(500).send({ message: 'Failed to enable 2FA' });
	}
});

// 2FA Disable
registerRoute(fastify, pub_url.http.auth.disable2FA, async (request, reply) => {
	const { userId } = request.body;

	const responseResult = await containers.db.post(int_url.http.db.disable2FA, {
		userId,
	});

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	if (response.status === 200) {
		return reply.status(200).send(response.data);
	} else {
		return reply.status(500).send({ message: 'Failed to disable 2FA' });
	}
});

// 2FA Login: Verify code after username/password
registerRoute(fastify, pub_url.http.auth.verify2FALogin, async (request, reply) => {
	const { tempToken, code } = request.body;

	// Check if temp token exists
	const pendingLogin = pending2FALogins.get(tempToken);
	if (!pendingLogin) {
		return reply.status(401).send({ message: 'Invalid or expired temp token' });
	}

	// Verify the 2FA code
	const responseResult = await containers.db.post(int_url.http.db.verify2FACode, {
		userId: pendingLogin.userId,
		code,
	});

	if (responseResult.isErr()) {
		return reply.status(500).send({ message: responseResult.unwrapErr() });
	}

	const response = responseResult.unwrap();
	if (response.status !== 200) {
		return reply.status(401).send({ message: 'Invalid 2FA code' });
	}

	// Valid code - delete temp token and generate real tokens
	pending2FALogins.delete(tempToken);

	// Fetch user data
	const userFetchResult = await containers.db.fetchUserData(pendingLogin.userId);
	
	if (userFetchResult.isErr()) {
		return reply.status(500).send({ message: 'Failed to fetch user data' });
	}

	const user = userFetchResult.unwrap();
	const tokenResult = await generateToken(user.id);

	if (tokenResult.isOk())
		return reply.status(200).send({ user, tokens: tokenResult.unwrap() });
	else
		return reply.status(500).send(tokenResult.unwrapErr());
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
