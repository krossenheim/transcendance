"use client"

import React, { useState } from "react"

export type GameMode = "1v1" | "multiplayer" | "tournament_1v1" | "tournament_multi"

interface PongInviteModalProps {
  isOpen: boolean
  onClose: () => void
  roomUsers: Array<{ id: number; username: string; onlineStatus?: number }>
  currentUserId: number
  onCreateGame: (mode: GameMode, selectedPlayers: number[], settings: GameSettings) => void
}

export interface GameSettings {
  ballCount: number
  maxScore: number
  allowPowerups: boolean
}

export default function PongInviteModal({
  isOpen,
  onClose,
  roomUsers,
  currentUserId,
  onCreateGame,
}: PongInviteModalProps) {
  const [gameMode, setGameMode] = useState<GameMode>("1v1")
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([])
  const [ballCount, setBallCount] = useState(1)
  const [maxScore, setMaxScore] = useState(5)
  const [allowPowerups, setAllowPowerups] = useState(false)

  if (!isOpen) return null

  const togglePlayerSelection = (userId: number) => {
    if (userId === currentUserId) return // Can't deselect yourself
    setSelectedPlayers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  const handleCreateGame = () => {
    // Always include current user
    const players = [currentUserId, ...selectedPlayers]

    // Validate player count based on game mode
    if (gameMode === "1v1" && players.length !== 2) {
      alert("1v1 mode requires exactly 2 players (including yourself)")
      return
    }

    if (gameMode === "tournament_1v1" && players.length < 4) {
      alert("Tournament 1v1 requires at least 4 players")
      return
    }

    if ((gameMode === "multiplayer" || gameMode === "tournament_multi") && players.length < 2) {
      alert("Multiplayer modes require at least 2 players")
      return
    }

    const settings: GameSettings = {
      ballCount,
      maxScore,
      allowPowerups,
    }

    onCreateGame(gameMode, players, settings)
    onClose()
  }

  const getGameModeDescription = () => {
    switch (gameMode) {
      case "1v1":
        return "Classic 1 vs 1 Pong - Two players compete directly"
      case "multiplayer":
        return "Multiplayer Pong - Multiple players compete in a free-for-all match"
      case "tournament_1v1":
        return "1v1 Tournament - Players compete in bracket-style matches"
      case "tournament_multi":
        return "Multiplayer Tournament - Teams compete in bracket-style matches"
    }
  }

  const getMinPlayers = () => {
    switch (gameMode) {
      case "1v1":
        return 2
      case "multiplayer":
        return 2
      case "tournament_1v1":
        return 4
      case "tournament_multi":
        return 4
    }
  }

  const availablePlayers = roomUsers.filter((u) => u.id !== currentUserId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-500 to-purple-500">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">🏓 Create Pong Game</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Game Mode Selection */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
              Select Game Mode
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setGameMode("1v1")}
                className={`p-4 rounded-lg border-2 transition-all ${
                  gameMode === "1v1"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-300 dark:border-gray-600 hover:border-blue-300"
                }`}
              >
                <div className="text-3xl mb-2">🎯</div>
                <div className="font-semibold text-gray-800 dark:text-gray-200">1 vs 1</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Classic Pong</div>
              </button>
              <button
                onClick={() => setGameMode("multiplayer")}
                className={`p-4 rounded-lg border-2 transition-all ${
                  gameMode === "multiplayer"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-300 dark:border-gray-600 hover:border-blue-300"
                }`}
              >
                <div className="text-3xl mb-2">👥</div>
                <div className="font-semibold text-gray-800 dark:text-gray-200">Multiplayer</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Free-for-all</div>
              </button>
              <button
                onClick={() => setGameMode("tournament_1v1")}
                className={`p-4 rounded-lg border-2 transition-all ${
                  gameMode === "tournament_1v1"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-300 dark:border-gray-600 hover:border-blue-300"
                }`}
              >
                <div className="text-3xl mb-2">🏆</div>
                <div className="font-semibold text-gray-800 dark:text-gray-200">1v1 Tournament</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Bracket style</div>
              </button>
              <button
                onClick={() => setGameMode("tournament_multi")}
                className={`p-4 rounded-lg border-2 transition-all ${
                  gameMode === "tournament_multi"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-300 dark:border-gray-600 hover:border-blue-300"
                }`}
              >
                <div className="text-3xl mb-2">🎖️</div>
                <div className="font-semibold text-gray-800 dark:text-gray-200">Multi Tournament</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Team brackets</div>
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{getGameModeDescription()}</p>
          </div>

          {/* Player Selection */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
              Select Players (Min: {getMinPlayers()})
            </h3>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-48 overflow-y-auto">
              {/* Current User - Always Selected */}
              <div className="flex items-center justify-between p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    You (Host)
                  </span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Auto-selected</div>
              </div>

              {/* Other Players */}
              {availablePlayers.length > 0 ? (
                availablePlayers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => togglePlayerSelection(user.id)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg mb-1 transition-colors ${
                      selectedPlayers.includes(user.id)
                        ? "bg-blue-100 dark:bg-blue-900/30"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          user.onlineStatus === 1 ? "bg-green-500" : "bg-gray-400"
                        }`}
                      />
                      <span className="text-sm text-gray-800 dark:text-gray-200">{user.username}</span>
                    </div>
                    {selectedPlayers.includes(user.id) && (
                      <span className="text-blue-500">✓</span>
                    )}
                  </button>
                ))
              ) : (
                <div className="text-sm text-gray-500 text-center py-4">
                  No other players available in this room
                </div>
              )}
            </div>
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Selected: {selectedPlayers.length + 1} player(s)
            </div>
          </div>

          {/* Game Settings */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
              Game Settings
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Number of Balls: {ballCount}
                </label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={ballCount}
                  onChange={(e) => setBallCount(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Max Score: {maxScore}
                </label>
                <input
                  type="range"
                  min="3"
                  max="21"
                  value={maxScore}
                  onChange={(e) => setMaxScore(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="powerups"
                  checked={allowPowerups}
                  onChange={(e) => setAllowPowerups(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="powerups" className="text-sm text-gray-700 dark:text-gray-300">
                  Enable Power-ups (experimental)
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateGame}
            className="px-6 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors font-semibold"
          >
            Create Game
          </button>
        </div>
      </div>
    </div>
  )
}
