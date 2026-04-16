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

  useEffect(() => {
    if (!authResponse) return

    const unsubscribe = subscribe(user_url.ws.pong.createLobby, (message, schema) => {
      if (message.code !== schema.output.LobbyCreated.code) {
        return HandlerResult.Handled
      }

      const payload = message.payload as any

      const isHost = payload.players?.some((p: any) =>
        (p.userId === authResponse.user.id || p.id === authResponse.user.id) && p.isHost
      )

      if (!isHost) {
        const hostPlayer = payload.players?.find((p: any) => p.isHost)
        const invitation: PongInvitation = {
          inviteId: payload.lobbyId || Date.now(),
          lobbyId: payload.lobbyId,
          hostId: hostPlayer?.userId || hostPlayer?.id || 0,
          hostUsername: hostPlayer?.username || `User ${hostPlayer?.userId || hostPlayer?.id}`,
          gameMode: payload.gameMode,
          playerCount: payload.players?.length || 0,
          timestamp: Date.now(),
          lobbyData: payload,
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

  return null
}

