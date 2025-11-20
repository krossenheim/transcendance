"use client"
import type React from "react"
import { useState, useEffect, useRef, createContext, type ReactNode, useContext, useCallback } from "react"

interface SocketComponentProps {
  children: ReactNode
  AuthResponseObject: any
}

interface WebSocketContextValue {
  socket: React.MutableRefObject<WebSocket | null>
  payloadReceived: any | null
  isConnected: boolean
  refreshToken: () => Promise<void>
}

// Global singleton socket
let globalSocket: WebSocket | null = null

const WebSocketContext = createContext<WebSocketContextValue | null>(null)

// Exported helper to forcibly close the global socket (useful on logout)
export function closeGlobalSocket() {
  if (globalSocket) {
    try {
      console.log('[v0] Closing global WebSocket connection')
      globalSocket.close()
    } catch (e) {
      console.warn('[v0] Error while closing global socket:', e)
    }
    globalSocket = null
  }
}

export default function SocketComponent({ children, AuthResponseObject }: SocketComponentProps) {
  const socket = useRef<WebSocket | null>(globalSocket)
  const [payloadReceived, setPayloadReceived] = useState<any | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [currentJwt, setCurrentJwt] = useState(AuthResponseObject.tokens.jwt)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const wsUrl = protocol + "//" + window.location.host + "/ws"

  // Function to refresh the JWT token
  const refreshToken = useCallback(async () => {
    try {
      console.log("[Auth] Refreshing JWT token...")
      console.log("[Auth] Using refresh token:", AuthResponseObject.tokens.refresh?.substring(0, 20) + "...")
      
      const response = await fetch("/public_api/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: AuthResponseObject.tokens.refresh, // Based on SingleToken schema
        }),
        credentials: "include", // Important: includes cookies if backend sets them
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }))
        console.error("[Auth] Token refresh failed with status:", response.status, errorData)
        throw new Error(`Token refresh failed: ${response.status} - ${errorData.message}`)
      }

      const data = await response.json()
      console.log("[Auth] Token refreshed successfully")
      console.log("[Auth] New JWT:", data.tokens.jwt?.substring(0, 20) + "...")
      
      // Update the current JWT
      setCurrentJwt(data.tokens.jwt)
      
      // Update AuthResponseObject to persist the new tokens
      AuthResponseObject.tokens.jwt = data.tokens.jwt
      if (data.tokens.refresh) {
        AuthResponseObject.tokens.refresh = data.tokens.refresh
        console.log("[Auth] New refresh token received")
      }
      
      // Re-authenticate the WebSocket with new token
      if (socket.current && socket.current.readyState === WebSocket.OPEN) {
        console.log("[Auth] Re-authenticating WebSocket with new token")
socket.current.send(JSON.stringify({
  target_container: "hub",
  funcId: "user_connected",
  payload: { token: data.tokens.jwt },
}))
      } else {
        console.warn("[Auth] WebSocket not connected, cannot re-authenticate")
      }
      
    } catch (error) {
      console.error("[Auth] Token refresh failed:", error)
      
      // Handle refresh failure - redirect to login after a short delay
      console.error("[Auth] Redirecting to login in 3 seconds...")
      setTimeout(() => {
        window.location.href = '/login'
      }, 3000)
    }
  }, [AuthResponseObject])

  // Setup token refresh interval (every 10 minutes)
  useEffect(() => {
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
    }

    // Refresh token every 10 minutes (600,000 ms)
    // You might want to adjust this based on your JWT expiration time
    // Generally, refresh before the token expires (e.g., if token expires in 15min, refresh at 10min)
    refreshIntervalRef.current = setInterval(() => {
      refreshToken()
    }, 10 * 60 * 1000) // 10 minutes

    console.log("[Auth] Token refresh scheduled every 10 minutes")

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        console.log("[Auth] Token refresh interval cleared")
      }
    }
  }, [refreshToken])

  useEffect(() => {
    if (!socket.current) {
      console.log("[v0] Creating new WebSocket connection to:", wsUrl)
      socket.current = new WebSocket(wsUrl)
      globalSocket = socket.current

      socket.current.onopen = () => {
        console.log("[v0] WebSocket connected, authorizing with JWT")
        socket.current!.send(JSON.stringify({ authorization: currentJwt }))
        setIsConnected(true)
        
        // Reset reconnection attempts on successful connection
        reconnectAttemptsRef.current = 0
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
      }

      socket.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log("[v0] WebSocket message received:", data)
          
          // Check if this is an auth error that requires token refresh
          if (data.code === 401 || data.message?.includes("unauthorized") || data.message?.includes("token expired")) {
            console.warn("[Auth] Received auth error, attempting token refresh")
            refreshToken()
          }
          
          setPayloadReceived(data)
        } catch {
          console.log("[v0] Couldn't parse:", event.data)
        }
      }

      socket.current.onclose = () => {
        console.log("[v0] WebSocket disconnected")
        globalSocket = null
        setIsConnected(false)
        
        // Implement reconnection with exponential backoff
        const maxAttempts = 5
        const baseDelay = 1000 // Start with 1 second
        
        if (reconnectAttemptsRef.current < maxAttempts) {
          const delay = Math.min(baseDelay * Math.pow(2, reconnectAttemptsRef.current), 30000) // Cap at 30 seconds
          reconnectAttemptsRef.current += 1
          
          console.log(`[v0] Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxAttempts})`)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("[v0] Reconnecting...")
            socket.current = null
            globalSocket = null
            // This will trigger the useEffect to create a new connection
            setIsConnected(false)
          }, delay)
        } else {
          console.error("[v0] Max reconnection attempts reached. Please refresh the page.")
          // Optionally show a user notification here
        }
      }

      socket.current.onerror = (err) => {
        console.error("[v0] WebSocket error:", err)
        setIsConnected(false)
      }
    } else {
      setIsConnected(socket.current.readyState === WebSocket.OPEN)
    }

    return () => {
      // Don't close the socket since it's a singleton
      // But clear any pending reconnection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [wsUrl, currentJwt, refreshToken])

  return (
    <WebSocketContext.Provider value={{ socket, payloadReceived, isConnected, refreshToken } as WebSocketContextValue}>
      {children}
      <div style={{ marginTop: "10px" }}>
        <input
          type="text"
          placeholder="debug ws send string"
          onKeyDown={(e) => {
            if (e.key === "Enter" && socket.current) {
              socket.current.send((e.target as HTMLInputElement).value)
              ;(e.target as HTMLInputElement).value = ""
            }
          }}
          style={{
            backgroundColor: "black",
            color: "yellow",
            border: "1px solid yellow",
            padding: "5px 10px",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
        <button
          onClick={refreshToken}
          style={{
            backgroundColor: "darkblue",
            color: "white",
            border: "1px solid blue",
            padding: "5px 10px",
            marginTop: "5px",
            cursor: "pointer",
          }}
        >
          Manual Token Refresh
        </button>
      </div>
    </WebSocketContext.Provider>
  )
}

export function useWebSocket() {
  const context = useContext(WebSocketContext)
  if (!context) throw new Error("useWebSocket must be used inside <SocketComponent>")
  return context
}