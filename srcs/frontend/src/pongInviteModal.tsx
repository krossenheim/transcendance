"use client"

import { useState, useMemo, useEffect } from "react"
import { getUserColorCSS } from "@utils/users"
import { useLanguage } from "./i18n/LanguageContext"
import { useGlobalStore } from "./features/global/store/globalStore"
import { usePongStore } from "./stores/pongStore"

export type GameMode = "1v1" | "multiplayer" | "tournament"

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
  const { t } = useLanguage()
  const [gameMode, setGameMode] = useState<GameMode>("1v1")
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([])
  const [ballCount, setBallCount] = useState(1)
  const [maxScore, setMaxScore] = useState(5)
  const [allowPowerups, setAllowPowerups] = useState(true)

  // Get room users from pong store (set by ChatHeader)
  const storeInviteRoomUsers = usePongStore((state) => state.inviteRoomUsers)
  const setInviteRoomUsers = usePongStore((state) => state.setInviteRoomUsers)

  // Get online friends from global store when roomUsers is empty (e.g. opened from Pong page directly)
  const onlineUsers = useGlobalStore((state) => state.users.data.onlineUsers)
  const friends = useGlobalStore((state) => state.users.data.friends)
  const userCache = useGlobalStore((state) => state.users.data.userCache)
  const fetchUserConnections = useGlobalStore((state) => state.users.actions.fetchUserConnections)

  // Clear store inviteRoomUsers when modal closes
  const handleClose = () => {
    setInviteRoomUsers([])
    setSelectedPlayers([])
    onClose()
  }

  // Fetch user connections when modal opens and no roomUsers are provided
  useEffect(() => {
    if (isOpen && roomUsers.length === 0 && storeInviteRoomUsers.length === 0) {
      fetchUserConnections()
    }
  }, [isOpen, roomUsers.length, storeInviteRoomUsers.length, fetchUserConnections])

  // Build available players list: use roomUsers prop, then store inviteRoomUsers, then friends
  const availablePlayers = useMemo(() => {
    // Priority 1: prop roomUsers (from AuthenticatedApp legacy flow)
    if (roomUsers.length > 0) {
      return roomUsers.filter((u) => u.id !== currentUserId)
    }
    
    // Priority 2: store inviteRoomUsers (from ChatHeader)
    if (storeInviteRoomUsers.length > 0) {
      return storeInviteRoomUsers.filter((u) => u.id !== currentUserId)
    }
    
    // Priority 3: all friends from global store (opened from Pong page directly)
    return [...friends]
      .filter((id) => id !== currentUserId)
      .map((id) => {
        const cached = userCache.get(id)
        return {
          id,
          username: cached?.username || `User ${id}`,
          onlineStatus: onlineUsers.has(id) ? 1 : 0,
        }
      })
  }, [roomUsers, storeInviteRoomUsers, currentUserId, onlineUsers, friends, userCache])

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
    // 1v1 allows just the host (second player is local guest on same keyboard)

    if (gameMode === "tournament" && players.length < 4) {
      alert(t('pong.alertTournamentPlayers'))
      return
    }

    if (gameMode === "multiplayer" && players.length < 2) {
      alert(t('pong.alertMultiplayerPlayers'))
      return
    }

    const settings: GameSettings = {
      ballCount,
      maxScore,
      allowPowerups,
    }

    onCreateGame(gameMode, players, settings)
    handleClose()
  }

  const getGameModeDescription = () => {
    switch (gameMode) {
      case "1v1":
        return t('pong.desc1v1')
      case "multiplayer":
        return t('pong.descMultiplayer')
      case "tournament":
        return t('pong.descTournament')
    }
  }

  const getMinPlayers = () => {
    switch (gameMode) {
      case "1v1":
        return 1
      case "multiplayer":
        return 2
      case "tournament":
        return 4
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="glass-light-sm dark:glass-dark-sm glass-border shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-500 to-purple-500">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">🏓 {t('pong.createPongGame')}</h2>
            <button
              onClick={handleClose}
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
              {t('pong.selectGameMode')}
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setGameMode("1v1")}
                className={`p-4 border-2 transition-all ${gameMode === "1v1"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-300 dark:border-gray-600 hover:border-blue-300"
                  }`}
              >
                <div className="text-3xl mb-2">🎯</div>
                <div className="font-semibold text-gray-800 dark:text-gray-200">{t('pong.oneVsOne')}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{t('pong.classicPong')}</div>
              </button>
              <button
                onClick={() => setGameMode("multiplayer")}
                className={`p-4 border-2 transition-all ${gameMode === "multiplayer"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-300 dark:border-gray-600 hover:border-blue-300"
                  }`}
              >
                <div className="text-3xl mb-2">👥</div>
                <div className="font-semibold text-gray-800 dark:text-gray-200">{t('pong.multiplayer')}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{t('pong.freeForAll')}</div>
              </button>
              <button
                onClick={() => setGameMode("tournament")}
                className={`p-4 border-2 transition-all ${gameMode === "tournament"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-300 dark:border-gray-600 hover:border-blue-300"
                  }`}
              >
                <div className="text-3xl mb-2">🏆</div>
                <div className="font-semibold text-gray-800 dark:text-gray-200">{t('pong.tournament')}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{t('pong.bracketStyle')}</div>
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{getGameModeDescription()}</p>
          </div>

          {/* Player Selection */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
              {t('pong.selectPlayers')} ({t('pong.minPlayers')}: {getMinPlayers()})
            </h3>
            <div className="bg-gray-50/40 dark:bg-gray-900/70 p-4 max-h-48 overflow-y-auto">
              {/* Current User - Always Selected */}
              <div className="flex items-center justify-between p-2 bg-blue-100 dark:bg-blue-900/30 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {t('pong.youHost')}
                  </span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{t('pong.autoSelected')}</div>
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
                  {t('pong.noPlayersAvailable')}
                </div>
              )}
            </div>
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {t('pong.selectedPlayers')}: {selectedPlayers.length + 1} {t('pong.players')}
            </div>
          </div>

          {/* Game Settings */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
              {t('pong.gameSettings')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('pong.numberOfBalls')}: {ballCount}
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
                  {t('pong.maxScore')}: {maxScore}
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
                  {t('pong.enablePowerups')}
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-900/70 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700/80 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600/80 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreateGame}
            className="px-6 py-2 bg-blue-500 text-white hover:bg-blue-600 transition-colors font-semibold"
          >
            {t('pong.createGame')}
          </button>
        </div>
      </div>
    </div>
  )
}
