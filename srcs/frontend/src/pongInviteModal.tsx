"use client"

import type { TypeUserGameConfigSchema } from "@app/shared/api/service/pong/pong_interfaces"
import { useState } from "react"
import { getUserColorCSS } from "./userColorUtils"

export type GameMode = "1v1" | "multiplayer" | "tournament_1v1" | "tournament_multi"

interface PongInviteModalProps {
  isOpen: boolean
  onClose: () => void
  roomUsers: Array<{ id: number; username: string; onlineStatus?: number }>
  currentUserId: number
  onCreateGame: (mode: GameMode, selectedPlayers: number[], settings: TypeUserGameConfigSchema) => void
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
  const [gameConfig, setGameConfig] = useState<TypeUserGameConfigSchema>({
    ballSpeed: 450,
    paddleSpeedFactor: 1.5,
    paddleWidthFactor: 0.1,
    powerupFrequency: 10,
    gameDuration: 180,
  })

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

    if (gameMode === "tournament_multi" && players.length < 4) {
      alert("Multiplayer tournament requires at least 4 players")
      return
    }

    if (gameMode === "multiplayer" && players.length < 2) {
      alert("Multiplayer mode requires at least 2 players")
      return
    }

    onCreateGame(gameMode, players, gameConfig)
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
      <div className="glass-light-sm dark:glass-dark-sm glass-border shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
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
          className={`p-4 border-2 transition-all ${gameMode === "1v1"
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
          className={`p-4 border-2 transition-all ${gameMode === "multiplayer"
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
          className={`p-4 border-2 transition-all ${gameMode === "tournament_1v1"
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
          className={`p-4 border-2 transition-all ${gameMode === "tournament_multi"
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
            <div className="bg-gray-50/40 dark:bg-gray-900/70 p-4 max-h-48 overflow-y-auto">
              {/* Current User - Always Selected */}
              <div className="flex items-center justify-between p-2 bg-blue-100 dark:bg-blue-900/30 mb-2">
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
              className={`w-full flex items-center justify-between p-2 mb-1 transition-colors ${selectedPlayers.includes(user.id)
                ? "bg-blue-100 dark:bg-blue-900/30"
                : "hover:bg-gray-100/40 dark:hover:bg-gray-800"
                }`}
            >
              <div className="flex items-center gap-2">
                <div
            className={`w-2 h-2 rounded-full ${user.onlineStatus === 1 ? "bg-green-500" : "bg-gray-400"
              }`}
                />
                <span
            className="text-sm font-semibold"
            style={{ color: getUserColorCSS(user.id, true) }}
                >
            {user.username}
                </span>
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
            Ball Speed: {gameConfig.ballSpeed}
          </label>
          <input
            type="range"
            min="100"
            max="1000"
            value={gameConfig.ballSpeed}
            onChange={(e) => setGameConfig({ ...gameConfig, ballSpeed: Number(e.target.value) })}
            className="w-full"
          />
              </div>
              <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Paddle Speed Factor: {gameConfig.paddleSpeedFactor.toFixed(1)}x
          </label>
          <input
            type="range"
            min="0.1"
            max="10.0"
            step="0.1"
            value={gameConfig.paddleSpeedFactor}
            onChange={(e) => setGameConfig({ ...gameConfig, paddleSpeedFactor: Number(e.target.value) })}
            className="w-full"
          />
              </div>
              <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Paddle Width Factor: {gameConfig.paddleWidthFactor.toFixed(2)}x
          </label>
          <input
            type="range"
            min="0.01"
            max="0.9"
            step="0.01"
            value={gameConfig.paddleWidthFactor}
            onChange={(e) => setGameConfig({ ...gameConfig, paddleWidthFactor: Number(e.target.value) })}
            className="w-full"
          />
              </div>
              <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Game Duration: {gameConfig.gameDuration}s
          </label>
          <input
            type="range"
            min="30"
            max="600"
            value={gameConfig.gameDuration}
            onChange={(e) => setGameConfig({ ...gameConfig, gameDuration: Number(e.target.value) })}
            className="w-full"
          />
              </div>
              <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Power-up Frequency: {gameConfig.powerupFrequency}
          </label>
          <input
            type="range"
            min="1"
            max="100"
            value={gameConfig.powerupFrequency}
            onChange={(e) => setGameConfig({ ...gameConfig, powerupFrequency: Number(e.target.value) })}
            className="w-full"
          />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-900/70 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700/80 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateGame}
            className="px-6 py-2 bg-blue-500 text-white hover:bg-blue-600 transition-colors font-semibold"
          >
            Create Game
          </button>
        </div>
      </div>
    </div>
  )
}
