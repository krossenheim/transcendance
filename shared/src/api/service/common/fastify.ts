import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import {
	serializerCompiler,
	validatorCompiler,
} from "fastify-type-provider-zod";
import { z } from "zod";
import type { HTTPRouteDef } from "@app/shared/api/service/common/endpoints";
import type { FastifyReply, FastifyRequest } from "fastify";

function addHealthcheckRoute(fastify: any) {
	registerRoute(
		fastify,
		{
			endpoint: "/health",
			method: "GET",
			schema: {
				response: {
					200: z.object({}),
				},
			},
		},
		async (req, reply) => {
			return reply.status(200).send({});
		}
	);
}

export function createFastify(options: FastifyServerOptions = {
	logger: {
		level: "info",
		transport: {
			target: "pino-pretty",
			options: {
				colorize: true,
				translateTime: "HH:MM:ss Z",
				ignore: "pid,hostname",
			},
		},
	},
}): FastifyInstance {
	options.disableRequestLogging = true;

	const server = Fastify(options);
	server.setValidatorCompiler(validatorCompiler);
	server.setSerializerCompiler(serializerCompiler);

	server.addHook('onResponse', (request, reply, done) => {
		if (reply.statusCode < 200 || reply.statusCode >= 300) {
			request.log.warn(
				{ method: request.method, url: request.url, statusCode: reply.statusCode, responseTime: reply.elapsedTime },
				'request failed'
			);
		}
		done();
	});

	addHealthcheckRoute(server);
	return server;
}

export type ReplyOf<T extends HTTPRouteDef> = Omit<FastifyReply, "status"> & {
	status<Code extends keyof T["schema"]["response"] & number>(
		code: Code
	): Omit<FastifyReply, "send"> & {
		send(payload: z.infer<T["schema"]["response"][Code]>): void;
	};
};

export type RouteBody<T extends HTTPRouteDef> =
	T["wrapper"] extends z.ZodTypeAny
	? Omit<z.infer<T["wrapper"]>, "payload"> & { payload: z.infer<T["schema"]["body"]> }
	: T["schema"] extends { body: z.ZodTypeAny }
	? z.infer<T["schema"]["body"]>
	: never;

export type RouteQuery<T extends HTTPRouteDef> =
	T["schema"] extends { query: z.ZodTypeAny }
	? z.infer<T["schema"]["query"]>
	: never;

export type RouteParams<T extends HTTPRouteDef> =
	T["schema"] extends { params: z.ZodTypeAny }
	? z.infer<T["schema"]["params"]>
	: never;

export function registerRoute<T extends HTTPRouteDef>(
	fastify: any,
	route: T,
	handler: (
		req: FastifyRequest<
			{
				Body: RouteBody<T>;
				Querystring: RouteQuery<T>;
				Params: RouteParams<T>;
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

	if (route.wrapper) {
		fastify[method](route.endpoint, { schema: route.wrapper.extend({ payload: route.schema.body }) }, async (req: any, reply: any) => {
			await handler(req as any, reply as any);
		});
	} else {
		fastify[method](route.endpoint, { schema: route.schema }, async (req: any, reply: any) => {
			await handler(req as any, reply as any);
		});
	}
}

export type { FastifyInstance };

export default { createFastify, registerRoute };

