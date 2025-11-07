"use client"

import { useCallback, useEffect, useState } from "react"
import { useWebSocket } from "./socketComponent"
import { user_url } from "../../../nodejs_base_image/utils/api/service/common/endpoints"

interface UserProfile {
  userId: number
  username: string
  email?: string
  avatar?: string
  bio?: string
  status?: "online" | "offline" | "in-game"
  joinDate?: string
  stats?: {
    gamesPlayed: number
    wins: number
    losses: number
  }
  isFriend?: boolean
  isBlocked?: boolean
}

interface ProfileComponentProps {
  userId: number
  isOpen: boolean
  onClose: () => void
}

export default function ProfileComponent({ userId, isOpen, onClose }: ProfileComponentProps) {
  const { socket, payloadReceived } = useWebSocket()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editedBio, setEditedBio] = useState("")
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)

  const sendToSocket = useCallback(
    (funcId: string, payload: any) => {
      if (socket.current && socket.current.readyState === WebSocket.OPEN) {
        const toSend = {
          funcId,
          payload,
          target_container: "users",
        }
        console.log("[v0] Sending profile request:", toSend)
        socket.current.send(JSON.stringify(toSend))
      }
    },
    [socket],
  )

  useEffect(() => {
    if (isOpen && userId) {
      console.log("[v0] ProfileComponent: Fetching profile for userId:", userId)
      setLoading(true)
      setError(null)
      sendToSocket(user_url.ws.users.getProfile.funcId, { userId })

      const timeout = setTimeout(() => {
        setLoading(false)
        setError("Unable to load profile. The backend may not have implemented the get_profile endpoint yet.")
        console.error("[v0] Profile request timed out after 5 seconds")
      }, 5000)

      return () => clearTimeout(timeout)
    }
  }, [isOpen, userId, sendToSocket])

  useEffect(() => {
    if (!payloadReceived) return

    console.log("[v0] Profile component received payload:", payloadReceived)
    console.log("[v0] Expected funcId:", user_url.ws.users.getProfile.funcId)
    console.log("[v0] Received funcId:", payloadReceived.funcId)

    if (payloadReceived.funcId === user_url.ws.users.getProfile.funcId) {
      console.log("[v0] Profile data response matched! Code:", payloadReceived.code)
      if (payloadReceived.code === 0) {
        console.log("[v0] Profile data:", payloadReceived.payload)
        setProfile(payloadReceived.payload as UserProfile)
        setEditedBio(payloadReceived.payload.bio || "")
        setLoading(false)
        setError(null)
      } else {
        console.error("[v0] Failed to fetch profile:", payloadReceived.payload)
        setLoading(false)
        setError(payloadReceived.payload?.message || "Failed to load profile")
      }
    }

    if (payloadReceived.funcId === user_url.ws.users.updateProfile.funcId) {
      if (payloadReceived.code === 0) {
        setProfile((prev) => (prev ? { ...prev, bio: payloadReceived.payload.bio } : null))
        setEditing(false)
      }
    }
  }, [payloadReceived])

  const handleSaveBio = () => {
    sendToSocket(user_url.ws.users.updateProfile.funcId, { bio: editedBio })
  }

  const isOwnProfile = currentUserId === userId

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <>
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold">Error</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="py-8 px-6 text-center">
              <div className="text-red-600 mb-4">⚠️</div>
              <p className="text-gray-700">{error}</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </>
        ) : profile ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold">User Profile</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Avatar and Username */}
              <div className="flex items-center space-x-4">
                <div className="relative h-20 w-20 rounded-full overflow-hidden bg-gray-200">
                  {profile.avatar ? (
                    <img
                      src={profile.avatar || "/placeholder.svg"}
                      alt={profile.username}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-blue-500 text-white text-2xl font-bold">
                      {profile.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{profile.username}</h3>
                  {profile.status && (
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded-full mt-1 ${
                        profile.status === "online"
                          ? "bg-green-100 text-green-800"
                          : profile.status === "in-game"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {profile.status}
                    </span>
                  )}
                </div>
              </div>

              {/* Bio */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Bio</h4>
                {editing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editedBio}
                      onChange={(e) => setEditedBio(e.target.value)}
                      placeholder="Tell us about yourself..."
                      className="w-full min-h-[100px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={handleSaveBio}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditing(false)
                          setEditedBio(profile.bio || "")
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600">{profile.bio || "No bio yet"}</p>
                    {isOwnProfile && (
                      <button
                        onClick={() => setEditing(true)}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Edit Bio
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Stats */}
              {profile.stats && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Stats</h4>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">{profile.stats.gamesPlayed}</div>
                      <div className="text-xs text-gray-500">Games Played</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">{profile.stats.wins}</div>
                      <div className="text-xs text-gray-500">Wins</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-600">{profile.stats.losses}</div>
                      <div className="text-xs text-gray-500">Losses</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              {!isOwnProfile && (
                <div className="flex space-x-2">
                  <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                    Add Friend
                  </button>
                  <button className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors">
                    Send Message
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="py-8 px-6 text-center text-gray-500">Profile not found</div>
        )}
      </div>
    </div>
  )
}
