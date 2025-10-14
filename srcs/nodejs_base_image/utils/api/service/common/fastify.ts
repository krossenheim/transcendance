import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { z } from "zod";
import type { HTTPRouteDef } from "./endpoints.js";
import type { FastifyReply, FastifyRequest } from "fastify";

export function createFastify(options = { logger: true }): FastifyInstance {
  const server = Fastify(options);
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  return server;
}

type ReplyOf<T extends HTTPRouteDef> = Omit<FastifyReply, "status"> & {
	status<Code extends keyof T["schema"]["response"] & number>(
		code: Code
	): Omit<FastifyReply, "send"> & {
		send(payload: z.infer<T["schema"]["response"][Code]>): void;
	};
};

export function registerRoute<T extends HTTPRouteDef>(
	fastify: FastifyInstance,
	route: T,
	handler: (
		req: FastifyRequest<
			{
				Body: T["schema"] extends { body: z.ZodTypeAny }
					? z.infer<T["schema"]["body"]>
					: never;
				Querystring: T["schema"] extends { query: z.ZodTypeAny }
					? z.infer<T["schema"]["query"]>
					: never;
				Params: T["schema"] extends { params: z.ZodTypeAny }
					? z.infer<T["schema"]["params"]>
					: never;
			}
		>,
		reply: ReplyOf<T>
	) => Promise<void>
) {
	const method = (route.method ?? "POST").toLowerCase() as
		| "get"
		| "post"
		| "put"
		| "delete";

	fastify[method](route.endpoint, { schema: route.schema }, async (req, reply) => {
		await handler(req as any, reply as any);
	});
}


export default { createFastify, registerRoute };