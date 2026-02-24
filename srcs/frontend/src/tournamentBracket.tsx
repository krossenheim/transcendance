"use client"

import React from "react"
import { getUserColorCSS } from "@utils/users"
import MiniPongCanvas from "./MiniPongCanvas"
import type { TypeGameStateSchema } from "./types/pong-interfaces"

export interface TournamentMatch {
  matchId: number
  round: number
  player1: { id: number; username: string; alias?: string } | null
  player2: { id: number; username: string; alias?: string } | null
  winner: number | null
  status: "pending" | "in_progress" | "completed"
  readyPlayers?: number[] // Players who clicked "Join Match"
  gameId?: number // Associated pong game ID when match is in progress
}

export interface TournamentData {
  tournamentId: number
  name: string
  mode: "tournament"
  players: Array<{ id: number; username: string; alias?: string }>
  matches: TournamentMatch[]
  currentRound: number
  totalRounds: number
  status: "in_progress" | "completed"
  winner: { id: number; username: string; alias?: string } | null
  onchainTxHashes?: string[]
}

interface TournamentBracketProps {
  tournament: TournamentData
  currentUserId: number
  onJoinMatch: (matchId: number) => void
  onSpectate: (matchId: number) => void
  /** Stable callback to get the latest game state for a watched game */
  getWatchedGameState?: (gameId: number) => TypeGameStateSchema | null
  /** Version counter that triggers re-render when watched states update */
  watchedStatesVersion?: number
}

export default function TournamentBracket({
  tournament,
  currentUserId,
  onJoinMatch,
  onSpectate,
  getWatchedGameState,
  watchedStatesVersion: _watchedStatesVersion,
}: TournamentBracketProps) {
  const [waitingForMatch, setWaitingForMatch] = React.useState<number | null>(null)

  // Reset waiting state when match status changes
  React.useEffect(() => {
    if (waitingForMatch !== null) {
      const match = tournament.matches.find(m => m.matchId === waitingForMatch);
      if (match && match.status !== "pending") {
        setWaitingForMatch(null);
      }
    }
  }, [tournament.matches, waitingForMatch]);

  const handleJoinMatch = (matchId: number) => {
    setWaitingForMatch(matchId);
    onJoinMatch(matchId);
  };

  // Group matches by round
  const matchesByRound: Record<number, TournamentMatch[]> = {}
  tournament.matches.forEach((match) => {
    if (!matchesByRound[match.round]) matchesByRound[match.round] = []
    matchesByRound[match.round]!.push(match)
  })

  const getRoundName = (round: number) => {
    if (round === tournament.totalRounds) return "Finals"
    if (round === tournament.totalRounds - 1) return "Semi-Finals"
    if (round === tournament.totalRounds - 2) return "Quarter-Finals"
    return `Round ${round}`
  }

  return (
    <div className="glass-light-sm dark:glass-dark-sm glass-border shadow-lg p-6">
      {/* Header */}
      <div className="mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">🏆 {tournament.name}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Tournament
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

      {/* Blockchain Transaction Display */}
      {tournament.status === "completed" && tournament.onchainTxHashes && tournament.onchainTxHashes.length > 0 && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-500 rounded-lg">
          <h3 className="font-semibold text-green-700 dark:text-green-300 mb-2">⛓️ Recorded on Blockchain</h3>
          <div className="space-y-2">
            {tournament.onchainTxHashes.map((hash, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-gray-500">TX {idx + 1}:</span>
                <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono break-all">
                  {hash}
                </code>
                <a
                  href={`/blockchain-explorer/?tx=${hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:text-blue-700 underline"
                >
                  View
                </a>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            Tournament results permanently recorded on the blockchain
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
              className="p-2 bg-gray-50/40 dark:bg-gray-900/70 rounded-lg border border-gray-200 dark:border-gray-700 text-center"
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
      {tournament.matches.length > 0 && (
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
                        className={`bg-gray-50/40 dark:bg-gray-900/70 rounded-lg p-3 border-2 ${match.status === "in_progress"
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
                          className={`p-2 mb-1 rounded ${match.winner === match.player1?.id
                            ? "bg-green-100 dark:bg-green-900/30 font-bold"
                            : "bg-white/50 dark:bg-gray-800/80"
                            }`}
                        >
                          <div className="text-sm flex items-center justify-between">
                            {match.player1 ? (
                              <>
                                <span style={{ color: getUserColorCSS(match.player1.id, true) }}>
                                  {match.player1.alias || match.player1.username}
                                  {match.winner === match.player1.id && " 👑"}
                                </span>
                                {match.status === "pending" && match.readyPlayers?.includes(match.player1.id) && (
                                  <span className="text-green-500 text-xs">✓ Ready</span>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-400 italic">TBD</span>
                            )}
                          </div>
                        </div>

                        <div className="text-center text-xs text-gray-400 my-1">vs</div>

                        {/* Player 2 */}
                        <div
                          className={`p-2 rounded ${match.winner === match.player2?.id
                            ? "bg-green-100 dark:bg-green-900/30 font-bold"
                            : "bg-white/50 dark:bg-gray-800/80"
                            }`}
                        >
                          <div className="text-sm flex items-center justify-between">
                            {match.player2 ? (
                              <>
                                <span style={{ color: getUserColorCSS(match.player2.id, true) }}>
                                  {match.player2.alias || match.player2.username}
                                  {match.winner === match.player2.id && " 👑"}
                                </span>
                                {match.status === "pending" && match.readyPlayers?.includes(match.player2.id) && (
                                  <span className="text-green-500 text-xs">✓ Ready</span>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-400 italic">TBD</span>
                            )}
                          </div>
                        </div>

                        {/* Match Actions */}
                        {match.status === "pending" &&
                          match.player1 &&
                          match.player2 &&
                          (match.player1.id === currentUserId || match.player2.id === currentUserId) && (() => {
                            const isCurrentUserReady = match.readyPlayers?.includes(currentUserId) ?? false;
                            const isWaiting = isCurrentUserReady || waitingForMatch === match.matchId;
                            return (
                              <button
                                onClick={() => handleJoinMatch(match.matchId)}
                                disabled={isWaiting}
                                className={`mt-2 w-full py-1 text-xs rounded ${
                                  isWaiting
                                    ? "bg-yellow-500 text-white cursor-wait"
                                    : "bg-blue-500 text-white hover:bg-blue-600"
                                }`}
                              >
                                {isWaiting ? "⏳ Waiting for opponent..." : "Join Match"}
                              </button>
                            );
                          })()}
                        {match.status === "in_progress" && (() => {
                          const isInMatch = match.player1?.id === currentUserId || match.player2?.id === currentUserId;
                          const hasLivePreview = !isInMatch && match.gameId != null && getWatchedGameState;
                          return (
                            <div className="mt-2">
                              {/* Live mini-preview of the ongoing game */}
                              {hasLivePreview && (
                                <div className="mb-2">
                                  <MiniPongCanvas
                                    getGameState={getWatchedGameState}
                                    gameId={match.gameId!}
                                    width={230}
                                    height={180}
                                    onClick={() => onSpectate(match.matchId)}
                                  />
                                </div>
                              )}
                              {!hasLivePreview && (
                                <div className="text-xs text-center text-blue-500 font-semibold">🎮 In Progress...</div>
                              )}
                              {!isInMatch && !hasLivePreview && (
                                <button
                                  onClick={() => onSpectate(match.matchId)}
                                  className="mt-1 w-full py-1 text-xs rounded bg-purple-500 text-white hover:bg-purple-600"
                                >
                                  👁️ Spectate
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}


    </div>
  )
}

