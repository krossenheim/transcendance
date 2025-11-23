import type { FastifyInstance } from 'fastify';
import { registerRoute } from '../utils/api/service/common/fastify.js';
import { int_url } from '../utils/api/service/common/endpoints.js';
import { UserAccountType } from '../utils/api/service/db/user.js';
import { twoFactorService, userService } from '../main.js';
import { z } from 'zod';

async function twoFactorRoutes(fastify: FastifyInstance) {
  
  // Check if user has 2FA enabled
  registerRoute(fastify, int_url.http.db.check2FAStatus, async (request, reply) => {
    const { userId } = request.params;
    const result = twoFactorService.isEnabled(userId);

    if (result.isErr()) {
      return reply.status(500).send({ message: result.unwrapErr() });
    }

    return reply.status(200).send({ enabled: result.unwrap() });
  });

  // Generate 2FA secret and QR code (setup step 1)
  registerRoute(fastify, int_url.http.db.generate2FASecret, async (request, reply) => {
    const { userId, username } = request.body;
    
    // Check if user is a guest
    const userResult = userService.fetchUserById(userId);
    if (userResult.isOk() && userResult.unwrap().accountType === UserAccountType.Guest) {
      return reply.status(403).send({ message: 'Guest users cannot enable 2FA' });
    }
    
    const result = await twoFactorService.generateSecret(userId, username);

    if (result.isErr()) {
      return reply.status(500).send({ message: result.unwrapErr() });
    }

    const data = result.unwrap();
    return reply.status(200).send({
      qrCode: data.qrCode,
      secret: data.secret,
      uri: data.uri,
    });
  });

  // Enable 2FA (setup step 2 - after user scans QR and enters first code)
  registerRoute(fastify, int_url.http.db.enable2FA, async (request, reply) => {
    const { userId, code } = request.body;
    
    // Check if user is a guest
    const userResult = userService.fetchUserById(userId);
    if (userResult.isOk() && userResult.unwrap().accountType === UserAccountType.Guest) {
      return reply.status(403).send({ message: 'Guest users cannot enable 2FA' });
    }
    
    const result = twoFactorService.enable(userId, code);

    if (result.isErr()) {
      return reply.status(400).send({ message: result.unwrapErr() });
    }

    return reply.status(200).send({ message: '2FA enabled successfully' });
  });

  // Disable 2FA
  registerRoute(fastify, int_url.http.db.disable2FA, async (request, reply) => {
    const { userId } = request.body;
    const result = twoFactorService.disable(userId);

    if (result.isErr()) {
      return reply.status(500).send({ message: result.unwrapErr() });
    }

    return reply.status(200).send({ message: '2FA disabled successfully' });
  });

  // Verify 2FA code (used during login)
  registerRoute(fastify, int_url.http.db.verify2FACode, async (request, reply) => {
    const { userId, code } = request.body;
    const result = twoFactorService.verify(userId, code);

    if (result.isErr()) {
      return reply.status(400).send({ message: result.unwrapErr() });
    }

    const isValid = result.unwrap();
    if (isValid) {
      return reply.status(200).send({ valid: true });
    } else {
      return reply.status(401).send({ message: 'Invalid 2FA code' });
    }
  });
}

export default twoFactorRoutes;
