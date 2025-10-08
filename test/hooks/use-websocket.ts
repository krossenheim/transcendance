"use client"

import { useEffect, useRef, useState, useCallback } from "react"

interface WebSocketOptions {
  onMessage: (data: any) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onReconnect?: () => void
  onError?: (error: Event) => void
  maxReconnectAttempts?: number
  reconnectInterval?: number
  url?: string
}

export function useWebSocket({
  onMessage,
  onConnect,
  onDisconnect,
  onReconnect,
  onError,
  maxReconnectAttempts = 5,
  reconnectInterval = 3000,
  url,
}: WebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [isOfflineMode, setIsOfflineMode] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
  const messageQueueRef = useRef<any[]>([])
  const shouldReconnectRef = useRef(true)
  const reconnectAttemptsRef = useRef(0)
  const isConnectingRef = useRef(false)

  const onMessageRef = useRef(onMessage)
  const onConnectRef = useRef(onConnect)
  const onDisconnectRef = useRef(onDisconnect)
  const onReconnectRef = useRef(onReconnect)
  const onErrorRef = useRef(onError)

  // Update refs when callbacks change
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    onConnectRef.current = onConnect
  }, [onConnect])

  useEffect(() => {
    onDisconnectRef.current = onDisconnect
  }, [onDisconnect])

  useEffect(() => {
    onReconnectRef.current = onReconnect
  }, [onReconnect])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const connect = useCallback(() => {
    let wsUrl = url

    if (!wsUrl) {
      wsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || `wss://${window.location.host}/ws`

    }

    console.log("[v0] WebSocket URL from env:", process.env.NEXT_PUBLIC_WEBSOCKET_URL)
    console.log("[v0] Constructed WebSocket URL:", wsUrl)
    console.log("[v0] Window location:", typeof window !== "undefined" ? window.location.href : "server-side")

    if (!wsUrl) {
      console.log("[v0] No WebSocket URL available, running in offline mode")
      setIsOfflineMode(true)
      setConnectionError("No WebSocket server configured")
      return
    }

    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current) {
      console.log("[v0] Connection attempt already in progress")
      return
    }

    try {
      console.log("[v0] Attempting WebSocket connection to:", wsUrl)
      isConnectingRef.current = true
      setConnectionError(null)
      setIsOfflineMode(false)

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log("[v0] WebSocket connected successfully to:", wsUrl)
        isConnectingRef.current = false
        setIsConnected(true)
        setReconnectAttempts(0)
        reconnectAttemptsRef.current = 0
        setIsReconnecting(false)
        setConnectionError(null)
        onConnectRef.current?.()

        // Send queued messages
        while (messageQueueRef.current.length > 0) {
          const message = messageQueueRef.current.shift()
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message))
          }
        }
      }

      ws.onmessage = (event) => {
        try {
          const messageData = event.data
          console.log("[v0] Received WebSocket message:", messageData)

          if (typeof messageData === "string" && messageData.startsWith("DEBUG:")) {
            // Extract the JSON part after "DEBUG:"
            const jsonPart = messageData.substring("DEBUG:".length)
            const debugData = JSON.parse(jsonPart)

            // Extract the actual payload from the nested structure
            if (debugData.payload) {
              onMessageRef.current(debugData.payload)
            } else {
              onMessageRef.current(debugData)
            }
            return
          }

          if (typeof messageData === "string" && messageData.startsWith("Received: DEBUG:")) {
            const jsonPart = messageData.substring("Received: DEBUG:".length)
            const debugData = JSON.parse(jsonPart)

            if (debugData.payload) {
              onMessageRef.current(debugData.payload)
            } else {
              onMessageRef.current(debugData)
            }
            return
          }

          const data = JSON.parse(messageData)
          onMessageRef.current(data)
        } catch (error) {
          console.error("[v0] Failed to parse WebSocket message:", error)
          console.error("[v0] Raw message was:", event.data)

          if (typeof event.data === "string") {
            if (event.data.includes("Request served by") || event.data.includes("echo.websocket.org")) {
              // This is an echo server response, ignore it
              console.log("[v0] Ignoring echo server response:", event.data)
              return
            }

            // If it looks like a debug message, try to show it as system message
            if (event.data.includes("DEBUG:") || event.data.includes("Received:")) {
              onMessageRef.current({
                func_name: "generalPopUpText",
                message: `Server debug: ${event.data.substring(0, 100)}...`,
              })
            } else {
              onMessageRef.current({
                func_name: "generalPopUpText",
                message: `Received: ${event.data}`,
              })
            }
          }
        }
      }

      ws.onclose = (event) => {
        console.log("[v0] WebSocket disconnected. Code:", event.code, "Reason:", event.reason)
        isConnectingRef.current = false
        setIsConnected(false)
        wsRef.current = null
        onDisconnectRef.current?.()

        // Only attempt reconnection if we should and haven't exceeded max attempts
        if (shouldReconnectRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
          setIsReconnecting(true)
          reconnectAttemptsRef.current += 1
          setReconnectAttempts(reconnectAttemptsRef.current)

          const delay = reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current - 1)
          console.log(
            `[v0] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`,
          )

          reconnectTimeoutRef.current = setTimeout(() => {
            if (shouldReconnectRef.current) {
              onReconnectRef.current?.()
              connect()
            }
          }, delay)
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setConnectionError("Failed to reconnect after multiple attempts")
          setIsReconnecting(false)
        }
      }

      ws.onerror = (error) => {
        console.error("[v0] WebSocket error occurred:", error)
        console.error("[v0] WebSocket readyState:", ws.readyState)
        console.error("[v0] WebSocket URL was:", wsUrl)
        isConnectingRef.current = false
        setConnectionError(`Connection failed to ${wsUrl}`)
        onErrorRef.current?.(error)
      }
    } catch (error) {
      console.error("[v0] Failed to create WebSocket connection:", error)
      isConnectingRef.current = false
      setConnectionError("Failed to establish connection")
    }
  }, [url, maxReconnectAttempts, reconnectInterval])

  const disconnect = useCallback(() => {
    console.log("[v0] Manually disconnecting WebSocket")
    shouldReconnectRef.current = false
    isConnectingRef.current = false
    clearTimeout(reconnectTimeoutRef.current)

    if (wsRef.current) {
      wsRef.current.close(1000, "Manual disconnect")
    }

    setIsConnected(false)
    setIsReconnecting(false)
    setReconnectAttempts(0)
    reconnectAttemptsRef.current = 0
  }, [])

  const sendMessage = useCallback(
    (data: any) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          const messageStr = JSON.stringify(data)
          wsRef.current.send(messageStr)
          console.log("[v0] Sent WebSocket message:", messageStr)
        } catch (error) {
          console.error("[v0] Failed to send WebSocket message:", error)
          messageQueueRef.current.push(data)
        }
      } else {
        console.log("[v0] WebSocket not connected, queueing message:", data)
        messageQueueRef.current.push(data)

        if (
          !isConnectingRef.current &&
          !isReconnecting &&
          shouldReconnectRef.current &&
          reconnectAttemptsRef.current < maxReconnectAttempts
        ) {
          connect()
        }
      }
    },
    [isReconnecting, connect, maxReconnectAttempts],
  )

  const retry = useCallback(() => {
    setReconnectAttempts(0)
    reconnectAttemptsRef.current = 0
    setConnectionError(null)
    shouldReconnectRef.current = true
    isConnectingRef.current = false
    connect()
  }, [connect])

  useEffect(() => {
    shouldReconnectRef.current = true

    const initTimeout = setTimeout(() => {
      if (shouldReconnectRef.current) {
        connect()
      }
    }, 100)

    return () => {
      clearTimeout(initTimeout)
      shouldReconnectRef.current = false
      isConnectingRef.current = false
      clearTimeout(reconnectTimeoutRef.current)
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounting")
      }
    }
  }, [connect])

  return {
    socket: wsRef.current,
    connectionStatus: isOfflineMode
      ? "offline"
      : isConnected
        ? "connected"
        : isReconnecting
          ? "reconnecting"
          : "disconnected",
    isConnected,
    isReconnecting,
    reconnectAttempts,
    connectionError,
    isOfflineMode,
    sendMessage,
    disconnect,
    retry,
  }
}
