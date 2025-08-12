'use strict'

try
{
  require('./ensure_enviromental_vars.cjs');
} 
catch (err) 
{
  console.error('Failed to load module:', err.message);
  process.exit(1);
}

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


const ipInDockerSubnet = require("./ip_in_docker_subnet.cjs")

const fastify = require('fastify')()
fastify.register(require('@fastify/websocket'))
fastify.register(async function () 
{
    fastify.route({
    method: 'GET',
    url: '/ws',
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
      if (ipInDockerSubnet(req.headers.fromdockersubnet))
        prepend = "(From docker network)";
      else
        prepend = ("(From outside docker network)");
      console.log("Received: " + prepend + message);
      socket.send(prepend + message.toString().toUpperCase())})
    }
  })
})

fastify.register(async function (fastify) {
  fastify.get('/', (req, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
    <html>
      <head><title>WebSocket Test</title></head>
      <body>
        <h1>WebSocket Test</h1>
        <input id="myInput" type="text" placeholder="Type something" />
        <button id="sendBtn">Send</button>
        <div id="status">Connecting...</div>
        <script>
          protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
          ws = new WebSocket(protocol + '//' + location.host + '/ws')

          ws.onopen = () => {
            document.getElementById('status').textContent = 'Connected!'
          }

          ws.onmessage = (event) => {
            p = document.createElement('p')
            p.textContent = 'Server says: ' + event.data
            document.body.appendChild(p)
          }

          ws.onerror = (err) => {
            document.getElementById('status').textContent = 'Error: ' + err.message
          }

          ws.onclose = () => {
            document.getElementById('status').textContent = 'Disconnected'
          }
            function sendInput() {
            const val = document.getElementById('myInput').value;
            ws.send(val);
            document.getElementById('myInput').value = '';
          }

          // Send on button click
          document.getElementById('sendBtn').addEventListener('click', sendInput);

          // Send on Enter key press inside input
          document.getElementById('myInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
              sendInput();
            }
          });
        </script>
      </body>
    </html>`);
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

fastify.listen({ port: process.env.FASTIFY_PORT, host: process.env.FASTIFY_BIND_TO}, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
