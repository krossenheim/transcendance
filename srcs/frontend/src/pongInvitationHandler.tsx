"use client"

import { useEffect } from "react"
import { useWebSocket } from "./socketComponent"
import type { AuthResponseType } from "./types/auth-response"
import type { PongInvitation } from "./pongInviteNotifications"

interface PongInvitationHandlerProps {
  authResponse: AuthResponseType | null
  setPongInvitations: React.Dispatch<React.SetStateAction<PongInvitation[]>>
}

export default function PongInvitationHandler({
  authResponse,
  setPongInvitations,
}: PongInvitationHandlerProps) {
  const { payloadReceived } = useWebSocket()

  // Handle incoming pong lobby invitations globally
  useEffect(() => {
    if (!payloadReceived || !authResponse) return

    // Debug: Log pong-related messages
    if (payloadReceived.funcId === 'create_pong_lobby') {
      console.log("[PongInvitationHandler] Received:", JSON.stringify(payloadReceived))
    }

    if (payloadReceived.source_container !== 'pong') return
    if (payloadReceived.funcId !== 'create_pong_lobby' || payloadReceived.code !== 0) return

    console.log("[PongInvitationHandler] Processing lobby invitation:", payloadReceived.payload)

    // Check if we're the host (we created this)
    const isHost = payloadReceived.payload.players?.some((p: any) =>
      (p.userId === authResponse.user.id || p.id === authResponse.user.id) && p.isHost
    )

    console.log("[PongInvitationHandler] isHost check: myId=", authResponse.user.id, "isHost=", isHost)

    if (!isHost) {
      // We're an invited player - show notification
      console.log("[PongInvitationHandler] We're invited! Creating notification...")
      const hostPlayer = payloadReceived.payload.players?.find((p: any) => p.isHost)
      const invitation: PongInvitation = {
        inviteId: payloadReceived.payload.lobbyId || Date.now(),
        lobbyId: payloadReceived.payload.lobbyId,
        hostId: hostPlayer?.userId || hostPlayer?.id || 0,
        hostUsername: hostPlayer?.username || `User ${hostPlayer?.userId || hostPlayer?.id}`,
        gameMode: payloadReceived.payload.gameMode,
        playerCount: payloadReceived.payload.players?.length || 0,
        timestamp: Date.now(),
        lobbyData: payloadReceived.payload, // Store full lobby data
      }
      console.log("[PongInvitationHandler] Adding invitation to state:", invitation)
      setPongInvitations((prev) => [...prev, invitation])
    }
  }, [payloadReceived, authResponse, setPongInvitations])

  return null // This component doesn't render anything
}
