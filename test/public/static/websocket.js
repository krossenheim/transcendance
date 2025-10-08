// WebSocket client module that matches the original /static/websocket.js import
class ChatWebSocket extends WebSocket {
  constructor(url) {
    // Auto-detect WebSocket URL if not provided
    if (!url) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      const host = window.location.host
      url = `${protocol}//${host}/ws`
    }

    super(url)

    this.addEventListener("open", () => {
      console.log("WebSocket connected to:", url)
    })

    this.addEventListener("close", (event) => {
      console.log("WebSocket disconnected:", event.code, event.reason)
    })

    this.addEventListener("error", (error) => {
      console.error("WebSocket error:", error)
    })
  }
}

// Create and export a single WebSocket instance
const ws = new ChatWebSocket()

export default ws
