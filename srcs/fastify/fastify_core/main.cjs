'use strict'

const path = require('path');
const fastify = require('fastify')();

const ipInDockerSubnet = require("./ip_in_docker_subnet.cjs");

// WebSocket plugin
fastify.register(require('@fastify/websocket'));

// Serve static files from ./public
// phong.html, favicon.ico, favicon.png, etc.
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

// Force `/` to serve phong.html
fastify.get('/', (req, reply) => {
  reply.sendFile('phong.html'); // this overrides index.html
});

// WebSocket debug function
function barfInfo(socket, req) {
  socket.send(`Socket readyState: ${socket.readyState}`);
  socket.send(`Socket protocol: ${socket.protocol}`);
  socket.send(`Socket remote address: ${socket._socket.remoteAddress}`);
  socket.send(`Socket remote port: ${socket._socket.remotePort}`);
  socket.send(`Request method: ${req.method}`);
  socket.send(`Request url: ${req.url}`);
  socket.send(`Headers: ${JSON.stringify(req.headers)}`);
  socket.send(`Query: ${JSON.stringify(req.query)}`);
  socket.send(`Params: ${JSON.stringify(req.params)}`);
}

// WebSocket route
fastify.route({
  method: 'GET',
  url: '/ws',
  handler: (req, reply) => {
    // if accessed via HTTP, redirect to /
    reply.redirect('/');
  },
  wsHandler: (socket, req) => {
    barfInfo(socket, req);

    socket.on('message', message => {
      if (message == "info" || message == "barf")
        barfInfo(socket, req);

      let prepend = "empty";
      if (ipInDockerSubnet(req.headers[process.env.MESSAGE_FROM_DOCKER_NETWORK]))
        prepend = "(From docker network)";
      else
        prepend = ("(From outside docker network)");

      console.log("Received: " + prepend + message);
      socket.send(prepend + message.toString().toUpperCase());
    });
  }
});

// Fallback route (optional)
fastify.setNotFoundHandler((req, reply) => {
  reply.redirect('/');
});

// Start server
fastify.listen({ port: process.env.FASTIFY_PORT || 3000, host: process.env.FASTIFY_BIND_TO || '0.0.0.0' }, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
});
