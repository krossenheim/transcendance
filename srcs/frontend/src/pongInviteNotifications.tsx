"use client"

import React from "react"
import { getUserColorCSS } from "./userColorUtils"
import type { GameMode } from "./pongInviteModal"

export interface PongInvitation {
  inviteId: number
  lobbyId: number
  hostId: number
  hostUsername: string
  gameMode: GameMode
  playerCount: number
  timestamp: number
  lobbyData?: any // Full lobby data for immediate setup
}

interface PongInviteNotificationsProps {
  invitations: PongInvitation[]
  onAccept: (inviteId: number) => void
  onDecline: (inviteId: number) => void
}

export default function PongInviteNotifications({
  invitations,
  onAccept,
  onDecline,
}: PongInviteNotificationsProps) {
  console.log("[PongInviteNotifications] Rendering with", invitations.length, "invitations:", invitations);
  if (invitations.length === 0) return null

  const getGameModeLabel = (mode: GameMode) => {
    switch (mode) {
      case "1v1":
        return "1v1"
      case "multiplayer":
        return "Multiplayer"
      case "tournament_1v1":
        return "1v1 Tournament"
      case "tournament_multi":
        return "Multi Tournament"
    }
  }

  return (
    <div className="fixed top-20 right-6 z-50 space-y-2 max-w-sm">
      {invitations.map((invite) => (
        <div
          key={invite.inviteId}
          className="glass-light-sm dark:glass-dark-sm shadow-xl border-2 border-blue-500 p-4 animate-slide-in"
        >
          <div className="flex items-start gap-3">
            <div className="text-3xl">🏓</div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                Pong Invitation
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                <span
                  className="font-bold"
                  style={{ color: getUserColorCSS(invite.hostId, true) }}
                >
                  {invite.hostUsername}
                </span>{" "}
                invited you to play{" "}
                <span className="font-medium">{getGameModeLabel(invite.gameMode)}</span>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {invite.playerCount} player(s)
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onAccept(invite.inviteId)}
              className="flex-1 px-3 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors font-medium"
            >
              Accept
            </button>
            <button
              onClick={() => onDecline(invite.inviteId)}
              className="flex-1 px-3 py-2 bg-gray-300 dark:bg-gray-700/80 text-gray-800 dark:text-gray-200 text-sm rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600/80 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
