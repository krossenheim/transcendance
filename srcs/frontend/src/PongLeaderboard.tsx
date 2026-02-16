"use client"

import { useMemo } from "react"
import { getUserColorCSS } from "@utils/users"
import { useLanguage } from "./i18n/LanguageContext"

interface LeaderboardPlayer {
  id: number
  username: string
  score: number
}

interface PongLeaderboardProps {
  players: Array<{ id: number; username: string }>
  scores: { [key: number]: number } | null | undefined
}

export default function PongLeaderboard({ players, scores }: PongLeaderboardProps) {
  const { t } = useLanguage()
  // Combine player info with scores and sort by score descending
  const sortedPlayers = useMemo<LeaderboardPlayer[]>(() => {
    if (!players || players.length === 0) return []
    
    return players
      .map((player) => ({
        id: player.id,
        username: player.username,
        score: scores?.[player.id] ?? 0,
      }))
      .sort((a, b) => b.score - a.score)
  }, [players, scores])

  if (sortedPlayers.length === 0) {
    return null
  }

  return (
    <div className="absolute top-4 left-4 flex flex-col gap-1 pointer-events-none z-50">
      <div className="text-white text-xs font-bold mb-1 drop-shadow-lg uppercase tracking-wider">
        {t('pong.leaderboard')}
      </div>
      {sortedPlayers.map((player, index) => {
        const bgColor = getUserColorCSS(player.id, true)
        
        return (
          <div
            key={player.id}
            className="flex items-center justify-between gap-4 px-3 py-1.5 rounded-md backdrop-blur-sm transition-all duration-300"
            style={{
              backgroundColor: bgColor,
              boxShadow: `0 2px 8px ${bgColor}40`,
              transform: `translateY(0)`,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-black font-bold text-sm min-w-[1rem]">
                {index + 1}.
              </span>
              <span className="text-black font-semibold text-sm truncate max-w-[120px]">
                {player.username}
              </span>
            </div>
            <span className="text-black font-bold text-sm tabular-nums">
              {player.score}
            </span>
          </div>
        )
      })}
    </div>
  )
}
