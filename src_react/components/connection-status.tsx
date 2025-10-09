"use client"

import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Wifi, WifiOff, RotateCcw, AlertCircle } from "lucide-react"

interface ConnectionStatusProps {
  isConnected: boolean
  isReconnecting: boolean
  reconnectAttempts: number
  connectionError: string | null
  onRetry: () => void
}

export function ConnectionStatus({
  isConnected,
  isReconnecting,
  reconnectAttempts,
  connectionError,
  onRetry,
}: ConnectionStatusProps) {
  if (isConnected) {
    return (
      <div className="flex items-center gap-2">
        <Wifi className="w-4 h-4 text-green-500" />
        <Badge variant="secondary" className="text-green-700 bg-green-50">
          Connected
        </Badge>
      </div>
    )
  }

  if (isReconnecting) {
    return (
      <div className="flex items-center gap-2">
        <RotateCcw className="w-4 h-4 text-yellow-500 animate-spin" />
        <Badge variant="secondary" className="text-yellow-700 bg-yellow-50">
          Reconnecting... ({reconnectAttempts}/5)
        </Badge>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4 text-red-500" />
        <Badge variant="destructive">Disconnected</Badge>
      </div>

      {connectionError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{connectionError}</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
