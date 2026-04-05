import type { FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

export async function proxyRequest(
  req: FastifyRequest,
  reply: FastifyReply,
  method: string,
  url: string,
  body: unknown
): Promise<void> {
  try {
    const response = await axios({
      method,
      url,
      headers: {
        ...req.headers,
        host: undefined,
        connection: undefined,
        'content-length': undefined,
      },
      data: body,
      params: req.query,
      maxRedirects: 0,
      validateStatus: () => true,
    });
    const headersToForward: Record<string, string> = {};
    const status = response.status;
    const respHeaders = response.headers || {};
    if (typeof respHeaders['content-type'] === 'string') {
      headersToForward['content-type'] = respHeaders['content-type'];
    }
    if (status >= 300 && status < 400 && typeof respHeaders['location'] === 'string') {
      headersToForward['location'] = respHeaders['location'];
    }
    return reply.code(status).headers(headersToForward).send(response.data);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error proxying request:", errorMessage);
    return reply.code(500).send({ error: "Internal Server Error" });
  }
}

export default proxyRequest;

