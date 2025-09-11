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
// --- --- --- --- --- --- --- --- --- --- ---
// 
// --- --- --- --- --- --- --- --- --- --- ---
// Urls<->methods below
fastify.register(async function (fastify) {
  fastify.route({
    method: 'POST',
    url: '/new_room',
    handler: (req, reply) => {
    const { roomName } = req.body;

    if (!roomName ) {
      return reply.status(400).send({ error: 'roomName is required' });
    }
	  let roomCreatedMessage = singletonChatRooms.addRoom(roomName);
	  reply.status(200).send(roomCreatedMessage);;
    },
  });
});

fastify.register(async function (fastify) {
  fastify.route({
    method: 'GET',
    url: '/list_rooms',
    handler: (req, reply) => {

	  let listedRooms = singletonChatRooms.listRooms();
	  reply.status(200).send(listedRooms);
    },
  });
});

fastify.register(async function (fastify) {
  fastify.route({
    method: 'POST',
    url: '/send_message_to_room',
    handler: (req, reply) => {
    const { fromUser, roomName, messageSent } = req.body;

    // Basic validation
    if (!fromUser ) {
      return reply.status(400).send({ error: 'fromUser is required' });
    }
    if (!roomName ) {
      return reply.status(400).send({ error: 'roomName is required' });
    }
    if (!messageSent ) {
      return reply.status(400).send({ error: 'messageSent is required' });
    }

	  let messagepayload = singletonChatRooms.sendMessage(fromUser, roomName, messageSent);
	  reply.status(200).send(messagepayload);
    },
  });
});

fastify.register(async function (fastify) {
  fastify.route({
    method: 'POST',
    url: '/add_to_room',
    handler: (req, reply) => {
    const { userAdds, roomToAdd, userToAdd } = req.body;

    // Basic validation
    if (!userAdds ) {
      return reply.status(400).send({ error: 'userAdds is required' });
    }
    if (!roomToAdd ) {
      return reply.status(400).send({ error: 'roomToAdd is required' });
    }
    if (!userToAdd ) {
      return reply.status(400).send({ error: 'userToAdd is required' });
    }

	  let apiMessageReturned = singletonChatRooms.addUserToRoom(userAdds, roomToAdd, userToAdd);
	  
    reply.status(200).send(apiMessageReturned.toJson());
    },
  });
});

// fastify.register(async function (fastify) {
//   fastify.route({
//     method: 'GET',
//     url: '/',
//     handler: (req, reply) => {
//       reply.send('Hello from chat room.');
//     },
//   });
// });

// fastify.register(async function () 
// {
//     fastify.route({
//     method: 'GET',
//     url: '*',
//     handler: (req, reply) => {
//       // this will handle http requests
//       reply.redirect('/');
//     },
//   })
// })

fastify.listen({ port: process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS, host: process.env.CHATROOM_BIND_TO}, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
