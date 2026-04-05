"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { getUserColorCSS } from "@utils/users"
import { useLanguage } from "./i18n/LanguageContext"
import { useGlobalStore } from "./features/global/store/globalStore"
import { usePongStore } from "./stores/pongStore"
import { user_url } from "@app/shared/api/service/common/endpoints"
import { getSocketSenderRef } from "@utils/socketRef"

export type GameMode = "1v1" | "multiplayer" | "tournament" | "lastOneStanding"

interface PongInviteModalProps {
  isOpen: boolean
  onClose: () => void
  roomUsers: Array<{ id: number; username: string; onlineStatus?: number }>
  currentUserId: number
  onCreateGame: (mode: GameMode, selectedPlayers: number[], settings: GameSettings, playerUsernames: { [key: number]: string }) => void
}

export interface GameSettings {
  ballCount: number
  maxScore: number
  allowPowerups: boolean
  aiCount: number
  aiDifficulty: number
  localPlayerNames?: string[]
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
  const [aiCount, setAiCount] = useState(0)
  const [aiDifficulty, setAiDifficulty] = useState(3)
  const [isLocalTournament, setIsLocalTournament] = useState(false)
  const [localPlayerNames, setLocalPlayerNames] = useState<string[]>(["", "", ""])

  const addLocalPlayer = () => {
    if (localPlayerNames.length < 7) {
      setLocalPlayerNames([...localPlayerNames, ""])
    }
  }
  const removeLocalPlayer = (index: number) => {
    if (localPlayerNames.length > 1) {
      setLocalPlayerNames(localPlayerNames.filter((_, i) => i !== index))
    }
  }
  const updateLocalPlayerName = (index: number, name: string) => {
    const updated = [...localPlayerNames]
    updated[index] = name
    setLocalPlayerNames(updated)
  }

  const [searchQuery, setSearchQuery] = useState("")
  const [searchedUsers, setSearchedUsers] = useState<Array<{ id: number; username: string; onlineStatus?: number }>>([])
  const [searchError, setSearchError] = useState("")
  const [searching, setSearching] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const storeInviteRoomUsers = usePongStore((state) => state.inviteRoomUsers)
  const setInviteRoomUsers = usePongStore((state) => state.setInviteRoomUsers)

  const onlineUsers = useGlobalStore((state) => state.users.data.onlineUsers)
  const friends = useGlobalStore((state) => state.users.data.friends)
  const userCache = useGlobalStore((state) => state.users.data.userCache)
  const fetchUserConnections = useGlobalStore((state) => state.users.actions.fetchUserConnections)

  const handleSearchUser = useCallback(() => {
    const query = searchQuery.trim()
    if (!query) return
    setSearchError("")
    setSearching(true)

    getSocketSenderRef()(user_url.ws.users.requestUserProfileData, query)

    let attempts = 0
    if (searchTimeoutRef.current) clearInterval(searchTimeoutRef.current)
    searchTimeoutRef.current = setInterval(() => {
      attempts++
      const cache = useGlobalStore.getState().users.data.userCache
      const found = Array.from(cache.values()).find(
        (u) => u.username.toLowerCase() === query.toLowerCase()
      )
      if (found) {
        if (searchTimeoutRef.current) clearInterval(searchTimeoutRef.current)
        setSearching(false)
        if (found.id === currentUserId) {
          setSearchError("That's you!")
          return
        }
        setSearchedUsers((prev) => {
          if (prev.some((u) => u.id === found.id)) return prev
          return [...prev, { id: found.id, username: found.username, onlineStatus: found.onlineStatus ?? 0 }]
        })
        setSearchQuery("")
      } else if (attempts > 20) {
        if (searchTimeoutRef.current) clearInterval(searchTimeoutRef.current)
        setSearching(false)
        setSearchError("User not found")
      }
    }, 100)
  }, [searchQuery, currentUserId])

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearInterval(searchTimeoutRef.current)
    }
  }, [])

  const handleClose = () => {
    setInviteRoomUsers([])
    setSelectedPlayers([])
    setSearchedUsers([])
    setSearchQuery("")
    setSearchError("")
    onClose()
  }

  useEffect(() => {
    if (isOpen && roomUsers.length === 0 && storeInviteRoomUsers.length === 0) {
      fetchUserConnections()
    }
  }, [isOpen, roomUsers.length, storeInviteRoomUsers.length, fetchUserConnections])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const availablePlayers = useMemo(() => {
    let basePlayers: Array<{ id: number; username: string; onlineStatus?: number }> = []

    if (roomUsers.length > 0) {
      basePlayers = roomUsers.filter((u) => u.id !== currentUserId)
    }
    else if (storeInviteRoomUsers.length > 0) {
      basePlayers = storeInviteRoomUsers.filter((u) => u.id !== currentUserId)
    }
    else {
      basePlayers = [...friends]
        .filter((id) => id !== currentUserId)
        .map((id) => {
          const cached = userCache.get(id)
          return {
            id,
            username: cached?.username || `User ${id}`,
            onlineStatus: onlineUsers.has(id) ? 1 : 0,
          }
        })
    }

    const baseIds = new Set(basePlayers.map((u) => u.id))
    const merged = [...basePlayers]
    for (const u of searchedUsers) {
      if (!baseIds.has(u.id) && u.id !== currentUserId) {
        merged.push(u)
      }
    }
    return merged
  }, [roomUsers, storeInviteRoomUsers, currentUserId, onlineUsers, friends, userCache, searchedUsers])

  if (!isOpen) return null

  const togglePlayerSelection = (userId: number) => {
    if (userId === currentUserId) return
    setSelectedPlayers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  const handleCreateGame = () => {
    const players = [currentUserId, ...selectedPlayers]

    if (gameMode === "tournament" && isLocalTournament) {
      const validNames = localPlayerNames.filter(n => n.trim().length > 0)
      const totalPlayerCount = 1 + validNames.length + aiCount
      if (totalPlayerCount < 4) {
        alert(t('pong.alertTournamentPlayers'))
        return
      }
      const nameSet = new Set(validNames.map(n => n.trim().toLowerCase()))
      if (nameSet.size !== validNames.length) {
        alert("Each local player must have a unique name")
        return
      }

      const settings: GameSettings = {
        ballCount,
        maxScore,
        allowPowerups,
        aiCount,
        aiDifficulty,
        localPlayerNames: validNames,
      }

      const playerUsernameMap: { [key: number]: string } = {}
      playerUsernameMap[currentUserId] = availablePlayers.find((u) => u.id === currentUserId)?.username
        || roomUsers.find(u => u.id === currentUserId)?.username
        || "Host"

      onCreateGame(gameMode, [currentUserId], settings, playerUsernameMap)
      handleClose()
      return
    }

    const totalPlayerCount = players.length + aiCount

    if (gameMode === "tournament" && totalPlayerCount < 4) {
      alert(t('pong.alertTournamentPlayers'))
      return
    }

    if (gameMode === "multiplayer" && totalPlayerCount < 2) {
      alert(t('pong.alertMultiplayerPlayers'))
      return
    }

    if (gameMode === "lastOneStanding" && totalPlayerCount < 2) {
      alert(t('pong.alertLastOneStandingMin'))
      return
    }

    if (gameMode === "lastOneStanding" && totalPlayerCount > 8) {
      alert(t('pong.alertLastOneStandingMax'))
      return
    }

    const settings: GameSettings = {
      ballCount,
      maxScore,
      allowPowerups,
      aiCount,
      aiDifficulty,
    }

    const playerUsernameMap: { [key: number]: string } = {}
    for (const p of players) {
      const found = availablePlayers.find((u) => u.id === p)
      if (found) playerUsernameMap[p] = found.username
    }

    onCreateGame(gameMode, players, settings, playerUsernameMap)
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
      case "lastOneStanding":
        return t('pong.descLastOneStanding')
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
      case "lastOneStanding":
        return 2
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="glass-dark-sm glass-border shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {}
        <div className="px-6 py-4 border-b border-gray-700 bg-gradient-to-r from-blue-500 to-purple-500">
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

        {}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {}
          <div>
            <h3 className="text-lg font-semibold text-gray-200 mb-3">
              {t('pong.selectGameMode')}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => setGameMode("1v1")}
                className={`p-4 border-2 transition-all ${gameMode === "1v1"
                  ? "border-blue-500 bg-blue-900/20"
                  : "border-gray-600 hover:border-blue-300"
                  }`}
              >
                <div className="text-3xl mb-2">🎯</div>
                <div className="font-semibold text-gray-200">{t('pong.oneVsOne')}</div>
                <div className="text-xs text-gray-400">{t('pong.classicPong')}</div>
              </button>
              <button
                onClick={() => setGameMode("multiplayer")}
                className={`p-4 border-2 transition-all ${gameMode === "multiplayer"
                  ? "border-blue-500 bg-blue-900/20"
                  : "border-gray-600 hover:border-blue-300"
                  }`}
              >
                <div className="text-3xl mb-2">👥</div>
                <div className="font-semibold text-gray-200">{t('pong.multiplayer')}</div>
                <div className="text-xs text-gray-400">{t('pong.freeForAll')}</div>
              </button>
              <button
                onClick={() => setGameMode("lastOneStanding")}
                className={`p-4 border-2 transition-all ${gameMode === "lastOneStanding"
                  ? "border-blue-500 bg-blue-900/20"
                  : "border-gray-600 hover:border-blue-300"
                  }`}
              >
                <div className="text-3xl mb-2">👑</div>
                <div className="font-semibold text-gray-200">{t('pong.lastOneStanding')}</div>
                <div className="text-xs text-gray-400">{t('pong.upTo8Players')}</div>
              </button>
              <button
                onClick={() => setGameMode("tournament")}
                className={`p-4 border-2 transition-all ${gameMode === "tournament"
                  ? "border-blue-500 bg-blue-900/20"
                  : "border-gray-600 hover:border-blue-300"
                  }`}
              >
                <div className="text-3xl mb-2">🏆</div>
                <div className="font-semibold text-gray-200">{t('pong.tournament')}</div>
                <div className="text-xs text-gray-400">{t('pong.bracketStyle')}</div>
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-400">{getGameModeDescription()}</p>
          </div>

          {}
          {!isLocalTournament && (
          <div>
            <h3 className="text-lg font-semibold text-gray-200 mb-3">
              {t('pong.selectPlayers')} ({t('pong.minPlayers')}: {getMinPlayers()})
            </h3>
            <div className="bg-gray-900/70 p-4 max-h-48 overflow-y-auto">
              {}
              <div className="flex items-center justify-between p-2 bg-blue-900/30 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-semibold text-gray-200">
                    {t('pong.youHost')}
                  </span>
                </div>
                <div className="text-xs text-gray-400">{t('pong.autoSelected')}</div>
              </div>

              {}
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchError("") }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchUser() } }}
                  placeholder={t('pong.searchByUsername') || "Search by username..."}
                  maxLength={32}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-600 rounded bg-gray-800 text-gray-200 placeholder-gray-400"
                />
                <button
                  onClick={handleSearchUser}
                  disabled={searching || !searchQuery.trim()}
                  className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {searching ? "..." : "🔍"}
                </button>
              </div>
              {searchError && (
                <div className="text-xs text-red-500 mb-2">{searchError}</div>
              )}

              {}
              {availablePlayers.length > 0 ? (
                availablePlayers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => togglePlayerSelection(user.id)}
                    className={`w-full flex items-center justify-between p-2 mb-1 transition-colors ${selectedPlayers.includes(user.id)
                      ? "bg-blue-900/30"
                      : "hover:bg-gray-800"
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${user.onlineStatus === 1 ? "bg-green-500" : "bg-gray-400"
                          }`}
                      />
                      <span
                        className="text-sm font-semibold"
                        style={{ color: getUserColorCSS(user.id) }}
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
            <div className="mt-2 text-sm text-gray-400">
              {t('pong.selectedPlayers')}: {selectedPlayers.length + 1 + aiCount} {t('pong.players')}
              {aiCount > 0 && <span className="ml-1">({aiCount} 🤖)</span>}
            </div>
          </div>
          )}

          {}
          <div>
            <h3 className="text-lg font-semibold text-gray-200 mb-3">
              {t('pong.gameSettings')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
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
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('pong.maxScore')}: {maxScore === 0 ? '∞' : maxScore}
                </label>
                <input
                  type="range"
                  min="0"
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
                <label htmlFor="powerups" className="text-sm text-gray-300">
                  {t('pong.enablePowerups')}
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  🤖 {t('pong.aiPlayers')}: {aiCount}
                </label>
                <input
                  type="range"
                  min="0"
                  max="7"
                  value={aiCount}
                  onChange={(e) => setAiCount(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {t('pong.aiDescription')}
                </p>
                {aiCount > 0 && (
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      {t('pong.aiDifficulty')}
                    </label>
                    <div className="flex gap-2">
                      {[
                        { value: 1, label: t('pong.aiEasy'), color: 'bg-green-500' },
                        { value: 2, label: t('pong.aiMedium'), color: 'bg-yellow-500' },
                        { value: 3, label: t('pong.aiHard'), color: 'bg-red-500' },
                        { value: 4, label: t('pong.aiNightmare'), color: 'bg-purple-600' },
                      ].map(({ value, label, color }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setAiDifficulty(value)}
                          className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-all ${
                            aiDifficulty === value
                              ? `${color} text-white shadow-md`
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {}
          {gameMode === "tournament" && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="localTournament"
                  checked={isLocalTournament}
                  onChange={(e) => setIsLocalTournament(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="localTournament" className="text-sm font-semibold text-gray-300">
                  🏠 Local Tournament (same keyboard)
                </label>
              </div>
              {isLocalTournament && (
                <div className="bg-gray-900/70 p-4 rounded-lg border border-gray-700">
                  <p className="text-xs text-gray-400 mb-3">
                    Add players who will take turns playing on this computer. Each match uses WASD vs Arrow Keys.
                    You (the host) are automatically included.
                  </p>
                  <div className="space-y-2">
                    {}
                    <div className="flex items-center gap-2 p-2 bg-blue-900/30 rounded">
                      <span className="text-xs text-gray-500 w-6">🏠</span>
                      <span className="text-sm font-semibold text-gray-200">You (Host)</span>
                    </div>
                    {}
                    {localPlayerNames.map((name, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-6">P{index + 2}</span>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => updateLocalPlayerName(index, e.target.value)}
                          placeholder={`Player ${index + 2} name`}
                          maxLength={20}
                          className="flex-1 px-2 py-1 text-sm border border-gray-600 rounded bg-gray-800 text-gray-200"
                        />
                        {localPlayerNames.length > 1 && (
                          <button
                            onClick={() => removeLocalPlayer(index)}
                            className="text-red-500 hover:text-red-700 text-xs px-1"
                          >✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addLocalPlayer}
                    disabled={localPlayerNames.length >= 7}
                    className="mt-2 text-xs text-blue-500 hover:text-blue-700 disabled:text-gray-400"
                  >
                    + Add Player
                  </button>
                  <div className="mt-2 text-xs text-gray-500">
                    Total: {1 + localPlayerNames.filter(n => n.trim().length > 0).length + aiCount} players
                    {aiCount > 0 && ` (${aiCount} 🤖)`}
                    {(1 + localPlayerNames.filter(n => n.trim().length > 0).length + aiCount) < 4 &&
                      <span className="text-red-500 ml-1">(need at least 4)</span>
                    }
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-900/70 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-700/80 text-gray-200 hover:bg-gray-600/80 transition-colors"
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

