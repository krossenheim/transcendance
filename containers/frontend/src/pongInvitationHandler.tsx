"use client"

import { useEffect } from "react"
import { useWebSocket, HandlerResult } from "./socketComponent"
import { user_url } from "@app/shared/api/service/common/endpoints"
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
  const { subscribe } = useWebSocket()

  // Handle incoming pong lobby invitations globally
  useEffect(() => {
    if (!authResponse) return

    const unsubscribe = subscribe(user_url.ws.pong.createLobby, (message, schema) => {
      console.log("[PongInvitationHandler] Received create_pong_lobby:", message)

      // Only process successful lobby creation (code 0)
      if (message.code !== schema.output.LobbyCreated.code) {
        return HandlerResult.Handled
      }

      const payload = message.payload as any
      console.log("[PongInvitationHandler] Processing lobby invitation:", payload)

      // Check if we're the host (we created this)
      const isHost = payload.players?.some((p: any) =>
        (p.userId === authResponse.user.id || p.id === authResponse.user.id) && p.isHost
      )

      console.log("[PongInvitationHandler] isHost check: myId=", authResponse.user.id, "isHost=", isHost)

      if (!isHost) {
        // We're an invited player - show notification
        console.log("[PongInvitationHandler] We're invited! Creating notification...")
        const hostPlayer = payload.players?.find((p: any) => p.isHost)
        const invitation: PongInvitation = {
          inviteId: payload.lobbyId || Date.now(),
          lobbyId: payload.lobbyId,
          hostId: hostPlayer?.userId || hostPlayer?.id || 0,
          hostUsername: hostPlayer?.username || `User ${hostPlayer?.userId || hostPlayer?.id}`,
          gameMode: payload.gameMode,
          playerCount: payload.players?.length || 0,
          timestamp: Date.now(),
          lobbyData: payload, // Store full lobby data
        }
        console.log("[PongInvitationHandler] Adding invitation to state:", invitation)
        setPongInvitations((prev) => [...prev, invitation])
      }

      return HandlerResult.Handled
    })

    return () => {
      unsubscribe()
    }
  }, [authResponse, setPongInvitations, subscribe])

  return null // This component doesn't render anything
}
