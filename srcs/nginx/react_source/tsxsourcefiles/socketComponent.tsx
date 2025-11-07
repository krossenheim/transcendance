"use client"

import type React from "react"
import { useState, useEffect, useRef, createContext, type ReactNode, useContext } from "react"

interface SocketComponentProps {
  children: ReactNode
  AuthResponseObject: any
}

interface WebSocketContextValue {
  socket: React.MutableRefObject<WebSocket | null>
  payloadReceived: any | null
  isConnected: boolean
}

// Global singleton socket
let globalSocket: WebSocket | null = null

const WebSocketContext = createContext<WebSocketContextValue | null>(null)

export default function SocketComponent({ children, AuthResponseObject }: SocketComponentProps) {
  const socket = useRef<WebSocket | null>(globalSocket)
  const [payloadReceived, setPayloadReceived] = useState<any | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const wsUrl = protocol + "//" + window.location.host + "/ws"

  useEffect(() => {
    if (!socket.current) {
      console.log("[v0] Creating new WebSocket connection to:", wsUrl)
      socket.current = new WebSocket(wsUrl)
      globalSocket = socket.current

      socket.current.onopen = () => {
        console.log("[v0] WebSocket connected, authorizing")
        socket.current!.send(JSON.stringify({ authorization: AuthResponseObject.tokens.jwt }))
        setIsConnected(true)
      }

      socket.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log("[v0] WebSocket message received:", data)
          setPayloadReceived(data)
        } catch {
          console.log("[v0] Couldn't parse:", event.data)
        }
      }

      socket.current.onclose = () => {
        console.log("[v0] WebSocket disconnected")
        globalSocket = null
        setIsConnected(false)
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
    }
  }, [wsUrl, AuthResponseObject.tokens.jwt])

  return (
    <WebSocketContext.Provider value={{ socket, payloadReceived, isConnected } as WebSocketContextValue}>
      {children}
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
          marginTop: "10px",
          width: "100%",
          boxSizing: "border-box",
        }}
      />
    </WebSocketContext.Provider>
  )
}

export function useWebSocket() {
  const context = useContext(WebSocketContext)
  if (!context) throw new Error("useWebSocket must be used inside <SocketComponent>")
  return context
}
