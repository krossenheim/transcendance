'use strict'

const ipInDockerSubnet = require("./ip_in_docker_subnet.cjs")
const fastify = require('fastify')({
  logger: {
    level: 'info', // or 'debug' for more verbosity
    transport: {
      target: 'pino-pretty', // pretty-print logs in development
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  }
})
fastify.register(require('@fastify/websocket'))
// Setup above

const { ChatRooms } = require("./roomClass.cjs")

// Room class above
const singletonChatRooms = new ChatRooms();
// Room global list above
fastify.register(async function (fastify) {
  fastify.route({
    method: 'POST',
    url: '/new_room',
    handler: (req, reply) => {
      const { roomName } = req.body;

      // Basic validation
      if (!roomName ) {
        return reply.status(400).send({ error: 'roomName is required' });
      }
	  let roomCreatedMessage = singletonChatRooms.addRoom(roomName);
      // Process arguments (example)
      // e.g., create a room in DB or memory here
	  reply.status(200).send(roomCreatedMessage);

    //   reply.send({
    //     message: roomCreatedMessage
    //   });
    },
  });
});

fastify.register(async function (fastify) {
  fastify.route({
    method: 'GET',
    url: '/list_rooms',
    handler: (req, reply) => {

	  let listedRooms = singletonChatRooms.listRooms();
      // Process arguments (example)
      // e.g., create a room in DB or memory here
	  reply.status(200).send(listedRooms);

    //   reply.send({
    //     message: listedRooms
    //   });
    },
  });
});

fastify.register(async function (fastify) {
  fastify.route({
    method: 'GET',
    url: '/',
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
