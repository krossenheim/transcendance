const axios = require('axios');

async function proxyRequest(req, reply, method, url) {
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
  } catch (error) {
    console.error("Error proxying request:", error);
    reply.code(500).send({ error: "Internal Server Error: " + error.message });
  }
}

module.exports = proxyRequest;