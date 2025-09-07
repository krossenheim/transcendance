'use strict'

const ipInDockerSubnet = require("./ip_in_docker_subnet.cjs")
const fastify = require('fastify')()
fastify.register(require('@fastify/websocket'))

fastify.register(async function (fastify) {
  fastify.route({
    method: 'GET',
    url: '/ws',
    handler: (req, reply) => {
      reply.send('Hello from chat room.');
    },
  });
});

fastify.register(async function () 
{
    fastify.route({
    method: 'GET',
    url: '*',
    handler: (req, reply) => {
      // this will handle http requests
      reply.redirect('/');
    },
  })
})

fastify.listen({ port: process.env.CHATROOM_PORT, host: process.env.CHATROOM_BIND_TO}, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
