import type { FastifyInstance } from 'fastify';
import { registerRoute } from '@app/shared/api/service/common/fastify';
import { int_url } from '@app/shared/api/service/common/endpoints';
import { UserAccountType } from '@app/shared/api/service/db/user';
import { twoFactorService, userService } from '../main.js';

async function twoFactorRoutes(fastify: FastifyInstance) {
  registerRoute(fastify, int_url.http.db.check2FAStatus, async (request, reply) => {
    const { userId } = request.params;
    const result = twoFactorService.isEnabled(userId);

    if (result.isErr()) {
      return reply.status(500).send({ message: result.unwrapErr().message });
    }

    return reply.status(200).send({ enabled: result.unwrap() });
  });

  registerRoute(fastify, int_url.http.db.generate2FASecret, async (request, reply) => {
    const { userId, username } = request.body;

    const userResult = userService.fetchUserById(userId);
    if (userResult.isOk() && userResult.unwrap().accountType === UserAccountType.Guest) {
      return reply.status(403).send({ message: 'Guest users cannot enable 2FA' });
    }

    const result = await twoFactorService.generateSecret(userId, username);

    if (result.isErr()) {
      return reply.status(500).send({ message: result.unwrapErr().message });
    }

    const data = result.unwrap();
    return reply.status(200).send({
      qrCode: data.qrCode,
      secret: data.secret,
      uri: data.uri,
    });
  });

  registerRoute(fastify, int_url.http.db.enable2FA, async (request, reply) => {
    const { userId, code } = request.body;

    const userResult = userService.fetchUserById(userId);
    if (userResult.isOk() && userResult.unwrap().accountType === UserAccountType.Guest) {
      return reply.status(403).send({ message: 'Guest users cannot enable 2FA' });
    }

    const result = await twoFactorService.enable(userId, code);

    if (result.isErr()) {
      return reply.status(400).send({ message: result.unwrapErr().message });
    }

    return reply.status(200).send({ message: '2FA enabled successfully' });
  });

  registerRoute(fastify, int_url.http.db.disable2FA, async (request, reply) => {
    const { userId } = request.body;
    const result = twoFactorService.disable2FA(userId);

    if (result.isErr()) {
      return reply.status(500).send({ message: result.unwrapErr().message });
    }

    return reply.status(200).send({ message: '2FA disabled successfully' });
  });

  registerRoute(fastify, int_url.http.db.verify2FACode, async (request, reply) => {
    const { userId, code } = request.body;
    const result = twoFactorService.verify(userId, code);

    if (result.isErr()) {
      return reply.status(400).send({ message: result.unwrapErr().message });
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

