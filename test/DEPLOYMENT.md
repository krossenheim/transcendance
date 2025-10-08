# Deployment Guide for Static Chat Application

This guide explains how to deploy your React chat application to your nginx server as static files.

## Quick Deployment Steps

### 1. Build the Application
\`\`\`bash
npm install
npm run build
\`\`\`

### 2. Upload Files
- Copy everything from the `out/` folder to your nginx directory: `/static/chat/`
- The structure should look like:
  \`\`\`
  /static/chat/
  ├── index.html          # Main login/chat page
  ├── debug/
  │   └── index.html      # Debug page
  ├── _next/              # CSS, JS, and other assets
  └── other files...
  \`\`\`

### 3. Access Your Application
- **Main Chat**: `https://localhost/static/chat/`
- **Debug Page**: `https://localhost/static/chat/debug/`

## WebSocket Server Integration

### Option 1: Auto-Detection (Recommended)
The app will automatically try to connect to `wss://your-domain/ws` or `ws://your-domain/ws` based on your site's protocol.

### Option 2: Custom WebSocket URL
Set the environment variable before building:
\`\`\`bash
export NEXT_PUBLIC_WEBSOCKET_URL="wss://your-server.com:8080/ws"
npm run build
\`\`\`

Or create a `.env.local` file:
\`\`\`
NEXT_PUBLIC_WEBSOCKET_URL=wss://your-server.com:8080/ws
\`\`\`

### Option 3: Nginx WebSocket Proxy
Add this to your nginx configuration to proxy WebSocket connections to your Fastify server:

\`\`\`nginx
# WebSocket proxy for chat
location /ws {
    proxy_pass http://127.0.0.1:3001;  # Your Fastify server port
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

# Static files for chat app
location /static/chat/ {
    alias /path/to/your/static/chat/;
    try_files $uri $uri/ $uri.html /index.html;
    
    # Handle client-side routing
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
\`\`\`

## WebSocket Message Format

Your Fastify server should handle these message types:

### Incoming Messages (from client):
\`\`\`json
{
  "container": "chat",
  "endpoint": "/api/chat/send_message_to_room",
  "message": "Hello world",
  "room_name": "general",
  "sender": "username",
  "user_id": "user123"
}
\`\`\`

### Outgoing Messages (to client):
\`\`\`json
{
  "func_name": "chatAddMessageToRoom",
  "room_name": "general",
  "message": "Hello world",
  "sender": "username"
}
\`\`\`

\`\`\`json
{
  "func_name": "generalPopUpText",
  "message": "System notification"
}
\`\`\`

\`\`\`json
{
  "func_name": "chatRoomAdded",
  "room_name": "new-room"
}
\`\`\`

## Demo Mode (Default)
Without a WebSocket server, the app runs in demo mode:
- Messages are stored locally in browser storage
- All chat features work for demonstration
- Perfect for testing and development

## Troubleshooting

### WebSocket Connection Issues
1. Check if your Fastify server is running on the expected port
2. Verify nginx proxy configuration for `/ws` endpoint
3. Check browser console for specific WebSocket error codes:
   - `1006`: Connection closed abnormally (server not running)
   - `1002`: Protocol error (message format issues)

### Assets Not Loading
- Ensure all files from the `out/` folder are uploaded
- Check that the `_next/` folder is present with CSS/JS files

### Blank Page
- Check browser console for errors
- Verify the `index.html` file is in the correct location

The application will automatically fall back to demo mode if WebSocket connection fails.
