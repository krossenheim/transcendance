'use strict'

const fastify = require('fastify')()
fastify.register(require('@fastify/websocket'))
fastify.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (socket /* WebSocket */, req /* FastifyRequest */) => {
    socket.on('message', message => {
      socket.send('Uppercased message -> ' + message.toString().toUpperCase())
    })
  })
})

fastify.register(async function (fastify) {
  fastify.get('/', (req, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
    <html>
      <head><title>WebSocket Test</title></head>
      <body>
        <h1>WebSocket Test</h1>
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
        </script>
      </body>
    </html>`);
  });
});


fastify.listen({ port: 3000, host: '::'}, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
