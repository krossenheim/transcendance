"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useWebSocket } from "@/hooks/use-websocket"

interface DebugAction {
  name: string
  label: string
  endpoint: string
  fields: Record<string, string>
}

export default function DebugPage() {
  const [rawMessage, setRawMessage] = useState("")
  const [logs, setLogs] = useState<string[]>([])
  const [actionInputs, setActionInputs] = useState<Record<string, Record<string, string>>>({})
  const outputRef = useRef<HTMLDivElement>(null)

  const handleMessage = useRef((data: any) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev, `[${timestamp}] Received: ${JSON.stringify(data)}`])
  }).current

  const handleConnect = useRef(() => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev, `[${timestamp}] WebSocket connected`])
  }).current

  const handleDisconnect = useRef(() => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev, `[${timestamp}] WebSocket disconnected`])
  }).current

  const handleError = useRef((error: Event) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev, `[${timestamp}] WebSocket error occurred`])
  }).current

  const { socket, connectionStatus, sendMessage } = useWebSocket({
    onMessage: handleMessage,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onError: handleError,
    maxReconnectAttempts: 3,
    reconnectInterval: 5000,
  })

  const actions: DebugAction[] = [
    {
      name: "sendAddRoom",
      label: "Add Room",
      endpoint: "/api/chat/add_a_new_room",
      fields: { room_name: "Room Name" },
    },
    {
      name: "sendAddToRoom",
      label: "Add To Room",
      endpoint: "/api/chat/add_to_room",
      fields: { room_name: "Room Name", user_to_add: "User ID" },
    },
    {
      name: "sendMessage",
      label: "Send Message",
      endpoint: "/api/chat/send_message_to_room",
      fields: { room_name: "Room Name", message: "Message" },
    },
  ]

  const logOutput = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`])
  }

  const sendRawMessage = () => {
    if (socket && socket.readyState === WebSocket.OPEN && rawMessage.trim()) {
      socket.send(rawMessage)
      logOutput(`Sent raw: ${rawMessage}`)
      setRawMessage("")
    } else if (!socket || socket.readyState !== WebSocket.OPEN) {
      logOutput("Error: WebSocket is not connected")
    } else {
      logOutput("Error: Message is empty")
    }
  }

  const sendActionMessage = (action: DebugAction) => {
    const inputs = actionInputs[action.name] || {}
    const payload: any = {
      endpoint: action.endpoint,
    }

    // Convert inputs to appropriate types
    for (const [field, value] of Object.entries(inputs)) {
      if (value.trim()) {
        const num = Number(value)
        payload[field] = !isNaN(num) && value !== "" ? num : value
      }
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      const message = JSON.stringify(payload)
      socket.send(message)
      logOutput(`Sent: ${message}`)

      // Clear inputs after send
      setActionInputs((prev) => ({
        ...prev,
        [action.name]: {},
      }))
    } else {
      logOutput("Error: WebSocket is not connected")
    }
  }

  const updateActionInput = (actionName: string, field: string, value: string) => {
    setActionInputs((prev) => ({
      ...prev,
      [actionName]: {
        ...prev[actionName],
        [field]: value,
      },
    }))
  }

  const clearLogs = () => {
    setLogs([])
  }

  // Auto-scroll logs
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">WebSocket Debug Console</h1>
        <Badge variant={connectionStatus === "connected" ? "default" : "destructive"}>{connectionStatus}</Badge>
      </div>

      {/* WebSocket Output */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>WebSocket Output</CardTitle>
          <Button variant="outline" size="sm" onClick={clearLogs}>
            Clear Logs
          </Button>
        </CardHeader>
        <CardContent>
          <div
            ref={outputRef}
            className="h-64 p-4 bg-gray-50 dark:bg-gray-900 border rounded-md overflow-auto font-mono text-sm whitespace-pre-wrap"
          >
            {logs.length === 0 ? (
              <div className="text-gray-500">No messages yet...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="mb-1">
                  {log}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Raw Message Input */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Send Raw Message</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={rawMessage}
              onChange={(e) => setRawMessage(e.target.value)}
              placeholder="Type raw message (JSON or text)"
              onKeyDown={(e) => e.key === "Enter" && sendRawMessage()}
              className="flex-1"
            />
            <Button onClick={sendRawMessage} disabled={connectionStatus !== "connected"}>
              Send Raw
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Predefined Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Predefined Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {actions.map((action) => (
            <div key={action.name} className="flex items-center gap-2 p-4 border rounded-lg">
              <div className="flex-1 flex gap-2">
                {Object.entries(action.fields).map(([field, label]) => (
                  <Input
                    key={field}
                    placeholder={label}
                    value={actionInputs[action.name]?.[field] || ""}
                    onChange={(e) => updateActionInput(action.name, field, e.target.value)}
                    className="w-48"
                  />
                ))}
              </div>
              <Button
                onClick={() => sendActionMessage(action)}
                disabled={connectionStatus !== "connected"}
                className="min-w-32"
              >
                {action.label}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {connectionStatus !== "connected" && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <p className="mb-2">WebSocket server not available</p>
              <p className="text-sm">
                To test with a real server, set the NEXT_PUBLIC_WEBSOCKET_URL environment variable or start a WebSocket
                server on ws://localhost:8080
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
