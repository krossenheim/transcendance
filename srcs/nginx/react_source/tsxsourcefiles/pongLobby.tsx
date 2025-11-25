"use client"

import React from "react"
import type { GameMode } from "./pongInviteModal"
import { getUserColorCSS } from "./userColorUtils"
import { getPaddleColorCSS } from "./BabylonPongRenderer"

export interface LobbyPlayer {
  id: number
  username: string
  isReady: boolean
  isHost: boolean
}

export interface PongLobbyData {
  lobbyId: number
  gameMode: GameMode
  players: LobbyPlayer[]
  settings: {
    ballCount: number
    maxScore: number
    allowPowerups: boolean
  }
  status: "waiting" | "starting" | "in_progress"
}

interface PongLobbyProps {
  lobby: PongLobbyData | null
  currentUserId: number
  onToggleReady: () => void
  onStartGame: () => void
  onLeaveLobby: () => void
}

export default function PongLobby({
  lobby,
  currentUserId,
  onToggleReady,
  onStartGame,
  onLeaveLobby,
}: PongLobbyProps) {
  if (!lobby) return null

  const currentPlayer = lobby.players.find((p) => p.id === currentUserId)
  const isHost = currentPlayer?.isHost || false
  const allReady = lobby.players.every((p) => p.isReady)
  const canStart = isHost && allReady && lobby.players.length >= 2

  const getGameModeLabel = () => {
    switch (lobby.gameMode) {
      case "1v1":
        return "1 vs 1"
      case "multiplayer":
        return "Multiplayer"
      case "tournament_1v1":
        return "1v1 Tournament"
      case "tournament_multi":
        return "Multi Tournament"
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border-2 border-blue-500">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
            🏓 Game Lobby
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {getGameModeLabel()} • Lobby #{lobby.lobbyId}
          </p>
        </div>
        <button
          onClick={onLeaveLobby}
          className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
        >
          Leave
        </button>
      </div>

      {/* Game Settings */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Game Settings
        </h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-400">Balls:</span>{" "}
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              {lobby.settings.ballCount}
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">Max Score:</span>{" "}
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              {lobby.settings.maxScore}
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">Power-ups:</span>{" "}
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              {lobby.settings.allowPowerups ? "Yes" : "No"}
            </span>
          </div>
        </div>
      </div>

      {/* Players List */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Players ({lobby.players.length})
        </h3>
        <div className="space-y-2">
          {lobby.players.map((player) => {
            // Color by user id so it matches paddle owner mapping
            const playerColor = getUserColorCSS(player.id, true)
            
            return (
              <div
                key={player.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  player.isReady
                    ? "bg-green-50 dark:bg-green-900/20 border border-green-500"
                    : "bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: playerColor }}
                  />
                  <span className="font-bold" style={{ color: playerColor }}>
                    {player.username}
                    {player.isHost && (
                      <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded">
                        HOST
                      </span>
                    )}
                    {player.id === currentUserId && (
                      <span className="ml-2 text-xs text-gray-600 dark:text-gray-400">(You)</span>
                    )}
                  </span>
                </div>
                <div className="text-sm font-semibold">
                  {player.isReady ? (
                    <span className="text-green-600 dark:text-green-400">✓ Ready</span>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">Waiting...</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Status Message */}
      {lobby.status === "starting" && (
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-500 rounded-lg text-center">
          <p className="text-blue-700 dark:text-blue-300 font-semibold">
            🎮 Game starting...
          </p>
        </div>
      )}

      {!allReady && lobby.status === "waiting" && (
        <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-500 rounded-lg text-center">
          <p className="text-yellow-700 dark:text-yellow-300 text-sm">
            ⏳ Waiting for all players to be ready...
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        {!isHost && (
          <button
            onClick={onToggleReady}
            className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${
              currentPlayer?.isReady
                ? "bg-gray-500 text-white hover:bg-gray-600"
                : "bg-green-500 text-white hover:bg-green-600"
            }`}
          >
            {currentPlayer?.isReady ? "Cancel Ready" : "I'm Ready!"}
          </button>
        )}
        {isHost && (
          <>
            <button
              onClick={onToggleReady}
              className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${
                currentPlayer?.isReady
                  ? "bg-gray-500 text-white hover:bg-gray-600"
                  : "bg-green-500 text-white hover:bg-green-600"
              }`}
            >
              {currentPlayer?.isReady ? "Cancel Ready" : "I'm Ready!"}
            </button>
            <button
              onClick={onStartGame}
              disabled={!canStart}
              className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${
                canStart
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed"
              }`}
            >
              Start Game
            </button>
          </>
        )}
      </div>

      {isHost && !canStart && (
        <p className="mt-3 text-xs text-center text-gray-500 dark:text-gray-400">
          {!allReady
            ? "All players must be ready before starting"
            : "Need at least 2 players to start"}
        </p>
      )}
    </div>
  )
}
