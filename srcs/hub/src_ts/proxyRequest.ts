import axios from 'axios';

export async function proxyRequest(req: any, reply: any, method: string, url: string, body: any) {
  console.log(`Proxying ${method} request to: ${url}`);
  console.log(`Query params:`, req.query);
  console.log(`Full req.url:`, req.url);
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
    console.log("Response from proxied request:", response.status);
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
  } catch (error : any) {
    console.log("Error proxying request:", error);
    return reply.code(500).send({ error: "Internal Server Error: " + error.message });
  }
}

export default proxyRequest;