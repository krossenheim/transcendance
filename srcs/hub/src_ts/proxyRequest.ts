import axios from 'axios';

export async function proxyRequest(req: any, reply: any, method: string, url: string) {
  console.log(`Proxying ${method} request to: ${url}`);
  console.log(req.headers);
  console.log(req.body);
  console.log(req.query);
  try {
    const response = await axios({
      method,
      url,
      headers: {
        ...req.headers,
        host: undefined,
        connection: undefined,
      },
      data: req.body,
      params: req.query,
      validateStatus: () => true,
    });
    reply.code(response.status).send(response.data);
  } catch (error : any) {
    console.error("Error proxying request:", error);
    reply.code(500).send({ error: "Internal Server Error: " + error.message });
  }
}

export default proxyRequest;