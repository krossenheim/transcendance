"use client"

import React from "react"
import { getUserColorCSS } from "./userColorUtils"

export interface TournamentMatch {
  matchId: number
  round: number
  player1: { id: number; username: string; alias?: string } | null
  player2: { id: number; username: string; alias?: string } | null
  winner: number | null
  status: "pending" | "in_progress" | "completed"
}

export interface TournamentData {
  tournamentId: number
  name: string
  mode: "tournament_1v1" | "tournament_multi"
  players: Array<{ id: number; username: string; alias?: string }>
  matches: TournamentMatch[]
  currentRound: number
  totalRounds: number
  status: "registration" | "in_progress" | "completed"
  winner: { id: number; username: string; alias?: string } | null
}

interface TournamentBracketProps {
  tournament: TournamentData
  currentUserId: number
  onEnterAlias: (alias: string) => void
  onJoinMatch: (matchId: number) => void
}

export default function TournamentBracket({
  tournament,
  currentUserId,
  onEnterAlias,
  onJoinMatch,
}: TournamentBracketProps) {
  const currentPlayer = tournament.players.find((p) => p.id === currentUserId)
  const [aliasInput, setAliasInput] = React.useState("")

  // Group matches by round
  const matchesByRound: Record<number, TournamentMatch[]> = {}
  tournament.matches.forEach((match) => {
    if (!matchesByRound[match.round]) matchesByRound[match.round] = []
    matchesByRound[match.round].push(match)
  })

  const getRoundName = (round: number) => {
    if (round === tournament.totalRounds) return "Finals"
    if (round === tournament.totalRounds - 1) return "Semi-Finals"
    if (round === tournament.totalRounds - 2) return "Quarter-Finals"
    return `Round ${round}`
  }

  const handleAliasSubmit = () => {
    const alias = aliasInput.trim()
    if (alias) {
      onEnterAlias(alias)
      setAliasInput("")
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
      {/* Header */}
      <div className="mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">🏆 {tournament.name}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {tournament.mode === "tournament_1v1" ? "1v1 Tournament" : "Multiplayer Tournament"}
              {" • "}Round {tournament.currentRound} of {tournament.totalRounds}
            </p>
          </div>
          {tournament.status === "completed" && tournament.winner && (
            <div className="text-right">
              <div className="text-xs text-gray-500">Winner</div>
              <div
                className="text-xl font-bold"
                style={{ color: getUserColorCSS(tournament.winner.id, true) }}
              >
                👑 {tournament.winner.alias || tournament.winner.username}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Registration Phase - Alias Entry */}
      {tournament.status === "registration" && !currentPlayer?.alias && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-500 rounded-lg">
          <h3 className="font-semibold text-blue-700 dark:text-blue-300 mb-3">📝 Enter Your Tournament Alias</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAliasSubmit()}
              placeholder="Enter your alias..."
              maxLength={20}
              className="flex-1 border border-blue-300 dark:border-blue-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-900 dark:text-gray-100"
            />
            <button
              onClick={handleAliasSubmit}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Submit
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            Choose a unique alias for this tournament (max 20 characters)
          </p>
        </div>
      )}

      {/* Players List */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Participants ({tournament.players.length})
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {tournament.players.map((player) => (
            <div
              key={player.id}
              className="p-2 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 text-center"
            >
              <div
                className="text-sm font-medium"
                style={{ color: getUserColorCSS(player.id, true) }}
              >
                {player.alias || player.username}
              </div>
              {player.id === currentUserId && <div className="text-xs text-blue-500">(You)</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Tournament Bracket */}
      {tournament.status !== "registration" && (
        <div className="overflow-x-auto">
          <div className="flex gap-8 min-w-max pb-4">
            {Array.from({ length: tournament.totalRounds }, (_, roundIndex) => {
              const round = roundIndex + 1
              const matches = matchesByRound[round] || []
              return (
                <div key={round} className="flex flex-col justify-around min-w-[250px]">
                  <h3 className="text-center font-bold text-gray-700 dark:text-gray-300 mb-4">
                    {getRoundName(round)}
                  </h3>
                  <div className="space-y-8">
                    {matches.map((match) => (
                      <div
                        key={match.matchId}
                        className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border-2 ${
                          match.status === "in_progress"
                            ? "border-blue-500"
                            : match.status === "completed"
                            ? "border-green-500"
                            : "border-gray-300 dark:border-gray-700"
                        }`}
                      >
                        <div className="text-xs text-center text-gray-500 dark:text-gray-400 mb-2">
                          Match #{match.matchId}
                        </div>

                        {/* Player 1 */}
                        <div
                          className={`p-2 mb-1 rounded ${
                            match.winner === match.player1?.id
                              ? "bg-green-100 dark:bg-green-900/30 font-bold"
                              : "bg-white dark:bg-gray-800"
                          }`}
                        >
                          <div className="text-sm">
                            {match.player1 ? (
                              <span style={{ color: getUserColorCSS(match.player1.id, true) }}>
                                {match.player1.alias || match.player1.username}
                                {match.winner === match.player1.id && " 👑"}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic">TBD</span>
                            )}
                          </div>
                        </div>

                        <div className="text-center text-xs text-gray-400 my-1">vs</div>

                        {/* Player 2 */}
                        <div
                          className={`p-2 rounded ${
                            match.winner === match.player2?.id
                              ? "bg-green-100 dark:bg-green-900/30 font-bold"
                              : "bg-white dark:bg-gray-800"
                          }`}
                        >
                          <div className="text-sm">
                            {match.player2 ? (
                              <span style={{ color: getUserColorCSS(match.player2.id, true) }}>
                                {match.player2.alias || match.player2.username}
                                {match.winner === match.player2.id && " 👑"}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic">TBD</span>
                            )}
                          </div>
                        </div>

                        {/* Match Actions */}
                        {match.status === "pending" &&
                          match.player1 &&
                          match.player2 &&
                          (match.player1.id === currentUserId || match.player2.id === currentUserId) && (
                            <button
                              onClick={() => onJoinMatch(match.matchId)}
                              className="mt-2 w-full py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                              Join Match
                            </button>
                          )}
                        {match.status === "in_progress" && (
                          <div className="mt-2 text-xs text-center text-blue-500 font-semibold">🎮 In Progress...</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tournament Status */}
      {tournament.status === "registration" && (
        <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-500 rounded-lg text-center">
          <p className="text-yellow-700 dark:text-yellow-300">
            ⏳ Tournament will begin once all players have entered their aliases
          </p>
        </div>
      )}
    </div>
  )
}

