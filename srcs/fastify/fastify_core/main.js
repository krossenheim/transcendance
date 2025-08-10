import Fastify from 'fastify'
import websocket from '@fastify/websocket'

const fastify = Fastify({ logger: true })

fastify.register(websocket)

fastify.get('/ws', { websocket: true }, (connection /* SocketStream */, req) => {
  connection.socket.on('message', message => {
    console.log('Received:', message.toString())
    connection.socket.send(`Echo: ${message}`)
  })

  connection.socket.on('close', () => {
    console.log('WebSocket connection closed')
  })

  connection.socket.on('error', err => {
    console.error('WebSocket error:', err)
  })
})

fastify.get('/wss', { websocket: true }, (connection /* SocketStream */, req) => {
  connection.socket.on('message', message => {
    console.log('Received:', message.toString())
    connection.socket.send(`Echo: ${message}`)
  })

  connection.socket.on('close', () => {
    console.log('WebSocket connection closed')
  })

  connection.socket.on('error', err => {
    console.error('WebSocket error:', err)
  })
})

fastify.get('/', async (request, reply) => {
  reply.type('text/html').send(`
    <!DOCTYPE html>
    <html>
      <head><title>WebSocket Test</title></head>
      <body>
        <h1>WebSocket Test</h1>
        <div id="status">Connecting...</div>
        <script>
          const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
          const ws = new WebSocket(protocol + '//' + location.host + '/ws')

          ws.onopen = () => {
            document.getElementById('status').textContent = 'Connected!'
            ws.send('Hello server!')
          }

          ws.onmessage = (event) => {
            const p = document.createElement('p')
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
    </html>
  `)
})

const start = async () => {
    console.log('Listening on port:', Number(process.env.FASTIFY_PORT) || 3000)
    console.log('Binding to host:', process.env.FASTIFY_BIND_TO || '0.0.0.0')
  try {
    await fastify.listen({
      port: Number(process.env.FASTIFY_PORT) || 3000,
      host: process.env.FASTIFY_BIND_TO || '0.0.0.0'
    })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()