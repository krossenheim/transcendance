"use client"

import type { GameMode } from "./pongInviteModal"
import { getUserColorCSS } from "./userColorUtils"
import { useLanguage } from "./i18n/LanguageContext"

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
  const { t } = useLanguage()
  
  if (!lobby) return null

  const currentPlayer = lobby.players.find((p) => p.id === currentUserId)
  const isHost = currentPlayer?.isHost || false
  const allReady = lobby.players.every((p) => p.isReady)
  const canStart = isHost && allReady && lobby.players.length >= 2

  const getGameModeLabel = () => {
    switch (lobby.gameMode) {
      case "1v1":
        return t('pong.oneVsOne')
      case "multiplayer":
        return t('pong.multiplayer')
      case "tournament_1v1":
        return t('pong.tournament1v1')
      case "tournament_multi":
        return t('pong.multiTournament')
    }
  }

  return (
    <div className="glass-light-sm dark:glass-dark-sm glass-border shadow-lg p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
            🏓 {t('pong.gameLobby')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {getGameModeLabel()} • {t('pong.lobby')} #{lobby.lobbyId}
          </p>
        </div>
        <button
          onClick={onLeaveLobby}
          className="px-4 py-2 bg-red-500 text-white hover:bg-red-600 transition-colors"
        >
          {t('pong.leave')}
        </button>
      </div>

      {/* Game Settings */}
      <div className="mb-6 p-4 bg-gray-50/40 dark:bg-gray-900/70">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {t('pong.gameSettings')}
        </h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-400">{t('pong.balls')}:</span>{" "}
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              {lobby.settings.ballCount}
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">{t('pong.maxScore')}:</span>{" "}
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              {lobby.settings.maxScore}
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">{t('pong.powerups')}:</span>{" "}
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              {lobby.settings.allowPowerups ? t('common.yes') : t('common.no')}
            </span>
          </div>
        </div>
      </div>

      {/* Players List */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          {t('pong.players')} ({lobby.players.length})
        </h3>
        <div className="space-y-2">
          {lobby.players.map((player) => {
            // Color by user id so it matches paddle owner mapping
            const playerColor = getUserColorCSS(player.id, true)

            return (
              <div
                key={player.id}
                className={`flex items-center justify-between p-3 ${player.isReady
                    ? "bg-green-50 dark:bg-green-900/20 border border-green-500"
                    : "bg-gray-50/40 dark:bg-gray-900/70 border border-gray-300 dark:border-gray-700"
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
                      <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-0.5">
                        {t('pong.host')}
                      </span>
                    )}
                    {player.id === currentUserId && (
                      <span className="ml-2 text-xs text-gray-600 dark:text-gray-400">{t('pong.you')}</span>
                    )}
                  </span>
                </div>
                <div className="text-sm font-semibold">
                  {player.isReady ? (
                    <span className="text-green-600 dark:text-green-400">✓ {t('pong.ready')}</span>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">{t('pong.waiting')}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Status Message */}
      {lobby.status === "starting" && (
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-500 text-center">
          <p className="text-blue-700 dark:text-blue-300 font-semibold">
            🎮 {t('pong.gameStarting')}
          </p>
        </div>
      )}

      {!allReady && lobby.status === "waiting" && (
        <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-500 text-center">
          <p className="text-yellow-700 dark:text-yellow-300 text-sm">
            ⏳ {t('pong.waitingAllReady')}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        {!isHost && (
          <button
            onClick={onToggleReady}
            className={`flex-1 py-3 font-semibold transition-colors ${currentPlayer?.isReady
                ? "bg-gray-500 text-white hover:bg-gray-600"
                : "bg-green-500 text-white hover:bg-green-600"
              }`}
          >
            {currentPlayer?.isReady ? t('pong.cancelReady') : t('pong.imReady')}
          </button>
        )}
        {isHost && (
          <>
            <button
              onClick={onToggleReady}
              className={`flex-1 py-3 font-semibold transition-colors ${currentPlayer?.isReady
                  ? "bg-gray-500 text-white hover:bg-gray-600"
                  : "bg-green-500 text-white hover:bg-green-600"
                }`}
            >
              {currentPlayer?.isReady ? t('pong.cancelReady') : t('pong.imReady')}
            </button>
            <button
              onClick={onStartGame}
              disabled={!canStart}
              className={`flex-1 py-3 font-semibold transition-colors ${canStart
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "bg-gray-300 dark:bg-gray-700/50 text-gray-500 dark:text-gray-500 cursor-not-allowed"
                }`}
            >
              {t('pong.startGame')}
            </button>
          </>
        )}
      </div>

      {isHost && !canStart && (
        <p className="mt-3 text-xs text-center text-gray-500 dark:text-gray-400">
          {!allReady
            ? t('pong.allReadyRequired')
            : t('pong.needMinPlayers')}
        </p>
      )}
    </div>
  )
}
