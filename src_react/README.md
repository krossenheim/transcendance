# Chatroom UI

A modern React-based chat application that works both online with WebSocket servers and offline in demo mode.

## Features

- **Real-time messaging** with WebSocket support
- **Room management** - create rooms, switch between rooms, invite users
- **Offline demo mode** - works without a server for testing and demonstrations
- **Responsive design** - works on desktop and mobile
- **Message persistence** - messages are saved locally
- **Debug console** - for testing WebSocket connections and messages

## Quick Start

### 1. Development Mode
\`\`\`bash
npm install
npm run dev
\`\`\`
Visit `http://localhost:3000`

### 2. Static Build (for nginx deployment)
\`\`\`bash
npm run build
\`\`\`
Upload the `out/` folder contents to your nginx server.

### 3. Test WebSocket Connection
- Visit `/test-websocket.html` to test your WebSocket server
- Visit `/debug` for advanced WebSocket debugging

## WebSocket Server

### Start Example Server
\`\`\`bash
node scripts/websocket-server-example.js
\`\`\`
This starts a WebSocket server on `ws://localhost:8080` that matches your original HTML protocol.

### Message Protocol
The app uses the same message format as your original HTML files:

**Outgoing (client to server):**
\`\`\`json
{
  "container": "chat",
  "endpoint": "/api/chat/send_message_to_room",
  "room_name": "general",
  "message": "Hello world",
  "sender": "username"
}
\`\`\`

**Incoming (server to client):**
\`\`\`json
{
  "func_name": "chatAddMessageToRoom",
  "room_name": "general",
  "message": "Hello world",
  "sender": "username"
}
\`\`\`

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## File Structure

- `app/` - Next.js pages (login, chat, debug)
- `components/` - React components
- `hooks/` - Custom React hooks including WebSocket management
- `public/static/` - Static assets including WebSocket client module
- `scripts/` - Example WebSocket server and utilities

## Demo Mode

Without a WebSocket server, the app automatically runs in demo mode where:
- Messages are stored locally in browser storage
- All UI features work for demonstration
- Perfect for testing and development
