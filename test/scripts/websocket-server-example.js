// Example WebSocket server for testing with Node.js
// Run with: node scripts/websocket-server-example.js

const WebSocket = require("ws")

const wss = new WebSocket.Server({ port: 8080 })

console.log("WebSocket server running on ws://localhost:8080")
console.log("This server matches the protocol from your original HTML files")

// Store rooms and users
const rooms = new Map()
const userRooms = new Map()

// Initialize default room
rooms.set("a", new Set())

wss.on("connection", function connection(ws) {
  console.log("Client connected")

  // Add client to default room
  const clientId = Math.random().toString(36).substr(2, 9)
  userRooms.set(ws, new Set(["a"]))
  rooms.get("a").add(ws)

  // Send welcome message
  ws.send(
    JSON.stringify({
      func_name: "generalPopUpText",
      message: "Connected to chat server! You're in room 'a'",
    }),
  )

  ws.on("message", function incoming(data) {
    try {
      const message = JSON.parse(data)
      console.log("Received:", message)

      // Handle different endpoints based on original HTML protocol
      if (message.container === "chat") {
        switch (message.endpoint) {
          case "/api/chat/send_message_to_room":
            handleSendMessage(message, ws)
            break
          case "/api/chat/add_a_new_room":
            handleAddRoom(message, ws)
            break
          case "/api/chat/add_to_room":
            handleAddToRoom(message, ws)
            break
          default:
            console.log("Unknown endpoint:", message.endpoint)
        }
      } else {
        // Handle raw messages (for debug mode)
        console.log("Raw message received:", data.toString())
        ws.send(
          JSON.stringify({
            func_name: "generalPopUpText",
            message: `Echo: ${data.toString()}`,
          }),
        )
      }
    } catch (error) {
      console.error("Error parsing message:", error)
      // Send raw message back as system message
      ws.send(
        JSON.stringify({
          func_name: "generalPopUpText",
          message: `Received raw: ${data.toString()}`,
        }),
      )
    }
  })

  ws.on("close", function close() {
    console.log("Client disconnected")
    // Remove client from all rooms
    const clientRooms = userRooms.get(ws)
    if (clientRooms) {
      clientRooms.forEach((roomName) => {
        const room = rooms.get(roomName)
        if (room) {
          room.delete(ws)
        }
      })
      userRooms.delete(ws)
    }
  })
})

function handleSendMessage(message, senderWs) {
  const { room_name, message: text, sender } = message

  if (!room_name || !text) {
    senderWs.send(
      JSON.stringify({
        func_name: "generalPopUpText",
        message: "Error: Missing room_name or message",
      }),
    )
    return
  }

  const room = rooms.get(room_name)
  if (!room) {
    senderWs.send(
      JSON.stringify({
        func_name: "generalPopUpText",
        message: `Error: Room '${room_name}' does not exist`,
      }),
    )
    return
  }

  // Broadcast message to all clients in the room
  const broadcastMessage = {
    func_name: "chatAddMessageToRoom",
    room_name: room_name,
    message: text,
    sender: sender || "Anonymous",
  }

  console.log(`Broadcasting to room '${room_name}':`, broadcastMessage)

  room.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(broadcastMessage))
    }
  })
}

function handleAddRoom(message, senderWs) {
  const { room_name } = message

  if (!room_name) {
    senderWs.send(
      JSON.stringify({
        func_name: "generalPopUpText",
        message: "Error: Missing room_name",
      }),
    )
    return
  }

  if (rooms.has(room_name)) {
    senderWs.send(
      JSON.stringify({
        func_name: "generalPopUpText",
        message: `Room '${room_name}' already exists`,
      }),
    )
    return
  }

  // Create new room
  rooms.set(room_name, new Set())
  console.log(`Created room: ${room_name}`)

  // Add sender to the new room
  const senderRooms = userRooms.get(senderWs) || new Set()
  senderRooms.add(room_name)
  userRooms.set(senderWs, senderRooms)
  rooms.get(room_name).add(senderWs)

  // Notify sender that room was created
  senderWs.send(
    JSON.stringify({
      func_name: "chatRoomAdded",
      room_name: room_name,
    }),
  )

  // Send confirmation message
  senderWs.send(
    JSON.stringify({
      func_name: "generalPopUpText",
      message: `Room '${room_name}' created successfully`,
    }),
  )
}

function handleAddToRoom(message, senderWs) {
  const { room_name, user_to_add } = message

  if (!room_name || !user_to_add) {
    senderWs.send(
      JSON.stringify({
        func_name: "generalPopUpText",
        message: "Error: Missing room_name or user_to_add",
      }),
    )
    return
  }

  if (!rooms.has(room_name)) {
    senderWs.send(
      JSON.stringify({
        func_name: "generalPopUpText",
        message: `Error: Room '${room_name}' does not exist`,
      }),
    )
    return
  }

  // In a real implementation, you'd look up the user by ID
  // For this example, we'll just send a confirmation
  senderWs.send(
    JSON.stringify({
      func_name: "generalPopUpText",
      message: `Invitation sent to user '${user_to_add}' for room '${room_name}'`,
    }),
  )

  console.log(`User '${user_to_add}' invited to room '${room_name}'`)
}

// Log current rooms every 30 seconds
setInterval(() => {
  console.log(`Active rooms: ${Array.from(rooms.keys()).join(", ")}`)
  rooms.forEach((clients, roomName) => {
    console.log(`  Room '${roomName}': ${clients.size} clients`)
  })
}, 30000)
