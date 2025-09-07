'use strict'

async function barfInfo(socket, req) {
  	const axios = require('axios');

    socket.send(`Socket readyState: ${socket.readyState}`);
    socket.send(`Socket protocol: ${socket.protocol}`);
    socket.send(`Socket remote address: ${socket._socket.remoteAddress}`);
    socket.send(`Socket remote port: ${socket._socket.remotePort}`);
    socket.send(`Request method: ${req.method}`);
    socket.send(`Request url: ${req.url}`);
    socket.send(`Headers: ${JSON.stringify(req.headers)}`);
    socket.send(`Query: ${JSON.stringify(req.query)}`);
    socket.send(`Params: ${JSON.stringify(req.params)}`);
	try {
	const res = await axios.get('http://chatroom_service:3001/');
	socket.send(res.data); // parsed JSON automatically
	} catch (err) {
	console.error('Error fetching from chatroom_service:', err.message);
	socket.send(JSON.stringify({ error: 'Error fetching from chatroom_service:' + err.message }));
	}


}


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

fastify.register(async function (fastify) {
  fastify.route({
    method: 'GET',
    url: '/ws',
    handler: (req, reply) => {
      reply.redirect('/');
    },
    wsHandler: (socket, req) => {
      console.log("Client connected");

      // Initial random state
      const state = {
        position: {
          baseX: Math.random() * 2,
          baseY: Math.random() * 2,
          baseZ: Math.random() * 2,
          t: 0, // time for sin()
        },
        rotation: {
          x: Math.random() * Math.PI * 2,
          y: Math.random() * Math.PI * 2,
          z: Math.random() * Math.PI * 2,
          deltaX: 0.02,
          deltaY: 0.03,
          deltaZ: 0.015,
        },
        color: {
          h: Math.random(), // hue 0..1
          deltaH: 0.002,
        },
      };

      const interval = setInterval(() => {
        // Update time
        state.position.t += 0.05;

        // Position oscillates ±2 units
        const pos = {
          x: state.position.baseX + Math.sin(state.position.t) * 2,
          y: state.position.baseY + Math.sin(state.position.t * 1.5) * 1, // y smaller amplitude
          z: state.position.baseZ + Math.sin(state.position.t * 0.7) * 2,
        };

        // Rotation increments by constant deltas
        state.rotation.x += state.rotation.deltaX;
        state.rotation.y += state.rotation.deltaY;
        state.rotation.z += state.rotation.deltaZ;

        // Color cycles hue
        state.color.h += state.color.deltaH;
        if (state.color.h > 1) state.color.h -= 1;

        // Convert hue to RGB
        const rgb = hsvToRgb(state.color.h, 0.8, 0.8);

        const msg = {
          type: "updateParams",
          data: {
            meshId: "box1",
            position: pos,
            rotation: {
              x: state.rotation.x,
              y: state.rotation.y,
              z: state.rotation.z,
            },
            color: rgb,
          },
        };

        socket.send(JSON.stringify(msg));
      }, 100);

      socket.on("close", () => {
        clearInterval(interval);
        console.log("Client disconnected");
      });
    },
  });
});

// Helper: HSV -> RGB
function hsvToRgb(h, s, v) {
  let r, g, b;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }

  return { r, g, b };
}



fastify.register(async function () 
{
    fastify.route({
    method: 'GET',
    url: '/wsdebug',
    handler: (req, reply) => {
      // this will handle http requests
      reply.redirect('/');
    },
    wsHandler: (socket, req) => {
      // this will handle websockets connections
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
      socket.send(prepend + message.toString().toUpperCase())})
    }
  })
})

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

fastify.listen({ port: process.env.BACKEND_HUB_PORT, host: process.env.BACKEND_HUB_BIND_TO}, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
