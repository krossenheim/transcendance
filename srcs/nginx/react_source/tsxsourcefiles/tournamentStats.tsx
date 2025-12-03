"use client"

import React from "react"

interface Props {
  tournamentId: number
  onClose?: () => void
}

export default function TournamentStats({ tournamentId, onClose }: Props) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [data, setData] = React.useState<any | null>(null)
  const [copiedHash, setCopiedHash] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/public_api/pong/tournaments/${tournamentId}/stats`)
      .then(async (r) => {
        if (cancelled) return
        // If server returned non-OK, try to parse JSON error body first
        if (!r.ok) {
          let errText = `${r.status} ${r.statusText}`
          try {
            const j = await r.json()
            if (j && j.message) errText = j.message
          } catch (e) {
            // ignore JSON parse errors and keep errText
          }
          throw new Error(errText)
        }
        // OK response — parse JSON
        return r.json()
      })
      .then((json) => {
        if (cancelled) return
        if (json && json.tournament) setData(json.tournament)
        else setError(json?.message || "Invalid response")
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
    return () => {
      cancelled = true
    }
  }, [tournamentId])

  if (loading) return <div className="p-4">Loading tournament stats...</div>
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>
  if (!data) return <div className="p-4">No data</div>

  // Normalize fields coming from backend: players use `userId`, not `id`.
  const players: any[] = Array.isArray(data.players)
    ? data.players.map((p: any) => ({
        id: p.id ?? p.userId ?? p.user_id,
        username: p.username ?? p.name ?? `User ${p.userId ?? p.id ?? '?'}`,
        alias: p.alias,
      }))
    : []

  const matches: any[] = Array.isArray(data.matches) ? data.matches : []

  const txHashes: string[] = Array.isArray(data.onchainTxHashes) ? data.onchainTxHashes : []
  // Vite env variable for explorer base (set VITE_EXPLORER_BASE=http://...)
  const explorerBase = (import.meta as any)?.env?.VITE_EXPLORER_BASE || "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg w-full max-w-3xl">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="font-bold">Tournament Stats — {data.name}</h3>
          <div>
            <button onClick={onClose} className="px-3 py-1 bg-gray-200 dark:bg-gray-800 rounded">Close</button>
          </div>
        </div>
        <div className="p-4">
          <div className="mb-3 text-sm text-gray-600">Status: {data.status} (id: {data.tournamentId || data.id || '—'})</div>
          <div className="mb-3">
            <strong>Players:</strong>
            <ul className="list-disc ml-5">
              {players.length === 0 ? (
                <li className="text-sm text-gray-500">No players</li>
              ) : (
                players.map((p: any) => (
                  <li key={p.id ?? JSON.stringify(p)}>
                    {p.alias || p.username} (id: {p.id})
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="mb-3">
            <strong>Matches:</strong>
            <div className="text-sm">
              {matches.length === 0 ? (
                <div className="text-sm text-gray-500">No matches yet.</div>
              ) : (
                matches.map((m: any) => (
                  <div key={m.matchId} className="py-1 border-b last:border-b-0">
                    Match #{m.matchId} — Round {m.round} — {m.status}
                    {m.player1Id || m.player2Id ? (
                      <div className="text-xs text-gray-500">Players: {m.player1Id ?? '—'} vs {m.player2Id ?? '—'}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mb-3">
            <strong>On-chain records</strong>
            {txHashes.length === 0 ? (
              <div className="text-sm text-gray-500">No on-chain records yet.</div>
            ) : (
              <ul className="list-none ml-0 space-y-2">
                {txHashes.map((h) => (
                  <li key={h} className="text-sm bg-gray-100 dark:bg-gray-800 rounded p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-green-600 dark:text-green-400">✓</span>
                      <span className="font-semibold">Transaction Recorded</span>
                    </div>
                    <div className="font-mono text-xs break-all mb-2 bg-gray-200 dark:bg-gray-700 p-2 rounded">
                      {h}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        title="Copy tx hash"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(h)
                            setCopiedHash(h)
                            setTimeout(() => setCopiedHash((cur) => (cur === h ? null : cur)), 1800)
                          } catch (e) {
                            // fallback: do nothing
                          }
                        }}
                        className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                      >
                        📋 Copy Hash
                      </button>
                      {explorerBase && (
                        <a
                          href={`${explorerBase.replace(/\/$/, "")}/tx/${h}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 bg-indigo-500 text-white rounded text-xs hover:bg-indigo-600 no-underline"
                        >
                          🔍 View in Explorer
                        </a>
                      )}
                      {copiedHash === h && (
                        <span className="text-green-600 dark:text-green-400 text-sm">Copied!</span>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      Contract: 0x5FbDB2315678afecb367f032d93F642f64180aa3
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
