"use client";
import { useEffect, useState } from "react";
import { useWebSocket } from "./socketComponent";
import { user_url } from "@app/shared/api/service/common/endpoints";

interface GameResult {
  id: number;
  userId: number;
  score: number;
  rank: number;
}

interface MatchHistoryProps {
  userId: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function MatchHistoryComponent({ userId, isOpen, onClose }: MatchHistoryProps) {
  const { sendMessage, payloadReceived } = useWebSocket();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GameResult[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    const toSend = {
      funcId: user_url.ws.users.fetchUserGameResults.funcId,
      payload: userId,
      target_container: "users",
    };
    sendMessage(toSend);
  }, [isOpen, userId, sendMessage]);

  useEffect(() => {
    if (!payloadReceived) return;
    if (payloadReceived.funcId === user_url.ws.users.fetchUserGameResults.funcId) {
      setLoading(false);
      if (payloadReceived.code === 0) {
        setResults(payloadReceived.payload || []);
      } else {
        setError(payloadReceived.payload?.message || "Failed to fetch match history");
      }
    }
  }, [payloadReceived]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div
        className="glass-light-sm dark:glass-dark-sm glass-border shadow-xl max-w-lg w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Match History</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <p className="ml-3 text-gray-600 dark:text-gray-400">Loading history...</p>
            </div>
          )}
          {!loading && error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}
          {!loading && !error && results.length === 0 && (
            <p className="text-gray-600 dark:text-gray-400 text-sm">No matches recorded yet.</p>
          )}
          {!loading && !error && results.length > 0 && (
            <ul className="space-y-3">
              {results.map((r) => {
                const outcome = r.rank === 1 ? "Win" : "Loss";
                return (
                  <li
                    key={r.id}
                    className="p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-900/70 flex justify-between items-center"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        Game #{r.id}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Score: {r.score}</div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-semibold ${outcome === "Win"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          }`}
                      >
                        {outcome}
                      </span>
                      <div className="text-[10px] text-gray-400 mt-1">Rank: {r.rank}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}