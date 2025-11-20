"use client"

import { useCallback, useEffect, useState, useRef } from "react"
import { useWebSocket } from "./socketComponent"
import { user_url } from "../../../nodejs_base_image/utils/api/service/common/endpoints"
import { TwoFactorSettings } from "./twoFactorSettings"

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
  isGuest?: boolean
}

interface ProfileComponentProps {
  userId: number
  isOpen: boolean
  onClose: () => void
  onStartDM?: (userId: number) => void
}

export default function ProfileComponent({ userId, isOpen, onClose, onStartDM }: ProfileComponentProps) {
  const { socket, payloadReceived, isConnected } = useWebSocket()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editedBio, setEditedBio] = useState("")
  const [editedUsername, setEditedUsername] = useState("")
  const [editedEmail, setEditedEmail] = useState("")
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [is2FAFlowActive, setIs2FAFlowActive] = useState(false)
  const [showSetupImmediately, setShowSetupImmediately] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sendToSocket = useCallback(
    (funcId: string, payload: any) => {
      if (socket.current && isConnected) {
        const toSend = {
          funcId,
          payload,
          target_container: "users",
        }
        console.log("[v0] Sending profile request:", toSend)
        console.log("[v0] Payload detail:", JSON.stringify(payload, null, 2))
        console.log("[v0] Payload type:", typeof payload)
        socket.current.send(JSON.stringify(toSend))
      } else {
        console.warn("[v0] Socket not connected, cannot send profile request")
        console.warn("[v0] isConnected:", isConnected)
        console.warn("[v0] Socket state:", socket.current?.readyState)
        setLoading(false)
        setError("WebSocket is not connected. Please check your connection.")
      }
    },
    [socket, isConnected],
  )

// Get current user ID from JWT token
useEffect(() => {
  const jwt = localStorage.getItem('jwt')
  if (jwt) {
    try {
      const payload = JSON.parse(atob(jwt.split('.')[1]))
      setCurrentUserId(payload.uid)
    } catch (error) {
      console.error('[v0] Error decoding JWT:', error)
    }
  }
}, [])

useEffect(() => {
  if (isOpen && userId) {
    console.log("[v0] ProfileComponent: Fetching profile for userId:", userId)
    setLoading(true)
    setError(null)

    // ✅ Clear any previous timeout before starting a new one
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    // Send request
    sendToSocket(user_url.ws.users.requestUserProfileData.funcId, userId)

    // ✅ Set a new timeout
    timeoutRef.current = setTimeout(() => {
      setLoading(false)
      setError("Request timed out. The profile endpoint may not be implemented or is not responding.")
      console.error("[v0] Profile request timed out after 5 seconds")
    }, 5000)
  }

  // Cleanup when closing modal or changing user
  return () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }
}, [isOpen, userId, sendToSocket])


  useEffect(() => {
    if (!payloadReceived) return

    console.log("[v0] Profile component received payload:", payloadReceived)
    console.log("[v0] Expected funcId:", user_url.ws.users.requestUserProfileData.funcId)
    console.log("[v0] Received funcId:", payloadReceived.funcId)

    if (payloadReceived.funcId === user_url.ws.users.requestUserProfileData.funcId) {
      // ✅ Clear timeout once we receive the profile response
if (timeoutRef.current) {
  clearTimeout(timeoutRef.current)
  timeoutRef.current = null
}

      console.log("[v0] Profile data response matched! Code:", payloadReceived.code)
      if (payloadReceived.code === 0) {
        console.log("[v0] Profile data:", payloadReceived.payload)
        
        // Transform backend response to our UserProfile format
        const backendData = payloadReceived.payload
        const transformedProfile: UserProfile = {
          userId: backendData.id,
          username: backendData.username,
          email: backendData.email,
          avatar: backendData.hasAvatar ? `/api/users/${backendData.id}/avatar` : undefined,
          bio: backendData.bio,
          status: "online", // Default status, backend doesn't provide this
          joinDate: backendData.createdAt ? new Date(backendData.createdAt * 1000).toISOString() : undefined,
          stats: backendData.stats, // Pass through if exists
          isGuest: backendData.isGuest,
        }
        
        console.log("[v0] Transformed profile:", transformedProfile)
        setProfile(transformedProfile)
        setEditedBio(transformedProfile.bio || "")
        setEditedUsername(transformedProfile.username)
        setEditedEmail(transformedProfile.email || "")
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

  // 🔒 Fetch avatar securely with JWT
useEffect(() => {
  const fetchAvatarWithAuth = async () => {
    if (!profile?.avatar) return

    try {
      const token = localStorage.getItem("jwt") // Adjust if your token lives elsewhere
      if (!token) {
        console.warn("[v0] No JWT token found; cannot fetch avatar")
        return
      }

      const response = await fetch(user_url.http.users.fetchUserAvatar.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`, // ✅ correct header
          "Content-Type": "application/json",
        },
        body: userId.toString(),
      })

      if (!response.ok) {
        console.error("[v0] Failed to fetch avatar:", response.status)
        return
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      setAvatarUrl(objectUrl)
    } catch (err) {
      console.error("[v0] Error loading avatar:", err)
    }
  }

  fetchAvatarWithAuth()

  // Cleanup to avoid memory leaks when switching users
  return () => {
    if (avatarUrl) URL.revokeObjectURL(avatarUrl)
  }
}, [profile?.userId])


  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setError("Avatar file must be less than 5MB")
        return
      }
      setAvatarFile(file)
    }
  }

  const handleSaveProfile = async () => {
    try {
      // First update profile info
      sendToSocket(user_url.ws.users.updateProfile.funcId, {
        userId: userId,
        username: editedUsername,
        email: editedEmail,
        bio: editedBio
      })

      // If there's a new avatar file, upload it
      if (avatarFile) {
        const formData = new FormData()
        formData.append('avatar', avatarFile)
        const response = await fetch(`/api/users/${userId}/avatar`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('jwt')}`
          },
          body: formData
        })

        if (!response.ok) {
          throw new Error('Failed to upload avatar')
        }

        // Refresh avatar
        const avatarResponse = await fetch(`/api/users/${userId}/avatar`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('jwt')}`
          }
        })
        
        if (avatarResponse.ok) {
          const blob = await avatarResponse.blob()
          setAvatarUrl(URL.createObjectURL(blob))
        }
      }

      setEditing(false)
      setAvatarFile(null)
      
      // Refresh profile data
      sendToSocket(user_url.ws.users.requestUserProfileData.funcId, userId)
    } catch (error) {
      console.error('Error saving profile:', error)
      alert('Failed to save profile')
    }
  }

  const handleAddFriend = () => {
    if (!userId) return
    console.log("[ProfileComponent] Sending friend request to userId:", userId)
    sendToSocket(user_url.ws.users.requestFriendship.funcId, userId)
    // TODO: Show success/error message based on response
  }

  const isOwnProfile = currentUserId === userId

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-dark-800 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="ml-3 text-gray-600 dark:text-gray-400">Loading profile...</p>
          </div>
        ) : error ? (
          <>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Error</h2>
              <button
                onClick={onClose}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="py-8 px-6 text-center">
              <div className="text-red-600 mb-4 text-4xl">⚠️</div>
              <p className="text-gray-700 dark:text-gray-300 mb-2">{error}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Check the console for more details. The backend may need to implement the profile endpoint.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-dark-600 transition-colors"
              >
                Close
              </button>
            </div>
          </>
        ) : profile ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">User Profile</h2>
              <button
                onClick={onClose}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Show only 2FA settings when flow is active */}
              {is2FAFlowActive && isOwnProfile && currentUserId && !profile.isGuest ? (
                <TwoFactorSettings 
                  userId={currentUserId} 
                  username={profile.username}
                  isGuest={profile.isGuest}
                  onActiveStateChange={(active) => {
                    setIs2FAFlowActive(active);
                    if (!active) setShowSetupImmediately(false);
                  }}
                  startWithSetup={showSetupImmediately}
                />
              ) : (
                <>
              {/* Avatar and Username */}
              <div className="flex items-center space-x-4">
                <div className="relative h-20 w-20 rounded-full overflow-hidden bg-gray-200 dark:bg-dark-700">
                  {profile.avatar ? (
                    <img
                      src={avatarUrl || "/placeholder.svg"}
                      alt={profile.username}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-blue-500 text-white text-2xl font-bold">
                      {profile.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  {isOwnProfile && editing && (
                    <>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs py-1 text-center"
                      >
                        Change Avatar
                      </button>
                    </>
                  )}
                </div>
                <div>
                  {editing && isOwnProfile ? (
                    <input
                      type="text"
                      value={editedUsername}
                      onChange={(e) => setEditedUsername(e.target.value)}
                      className="text-2xl font-bold border-b border-gray-300 dark:border-dark-600 focus:outline-none focus:border-blue-500 bg-white dark:bg-dark-800 text-gray-900 dark:text-white"
                    />
                  ) : (
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{profile.username}</h3>
                  )}
                  {profile.status && (
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded-full mt-1 ${
                        profile.status === "online"
                          ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                          : profile.status === "in-game"
                          ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200"
                          : "bg-gray-100 dark:bg-dark-700 text-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {profile.status}
                    </span>
                  )}
                </div>
              </div>

              {/* Email */}
              {isOwnProfile && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-gray-900 dark:text-white">Email</h4>
                  {editing ? (
                    <input
                      type="email"
                      value={editedEmail}
                      onChange={(e) => setEditedEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-dark-700 text-gray-900 dark:text-white"
                    />
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-400">{profile.email}</p>
                  )}
                </div>
              )}

              {/* Bio */}
              <div>
                <h4 className="text-sm font-semibold mb-2 text-gray-900 dark:text-white">Bio</h4>
                {editing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editedBio}
                      onChange={(e) => setEditedBio(e.target.value)}
                      placeholder="Tell us about yourself..."
                      className="w-full min-h-[100px] px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-dark-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                    />
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{profile.bio || "No bio yet"}</p>
                  </div>
                )}
              </div>

              {/* Edit/Save Buttons */}
              {isOwnProfile && (
                <div className="flex space-x-2 mt-4">
                  {editing ? (
                    <>
                      <button
                        onClick={handleSaveProfile}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                      >
                        Save Changes
                      </button>
                      <button
                        onClick={() => {
                          setEditing(false)
                          setEditedBio(profile.bio || "")
                          setEditedUsername(profile.username)
                          setEditedEmail(profile.email || "")
                          setAvatarFile(null)
                        }}
                        className="px-4 py-2 bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-dark-600 transition-colors text-sm"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditing(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                    >
                      Edit Profile
                    </button>
                  )}
                </div>
              )}

              {/* Two-Factor Authentication Settings - only for non-guest users */}
              {isOwnProfile && !editing && currentUserId && !profile.isGuest && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-dark-700">
                  <h4 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">Security Settings</h4>
                  <TwoFactorSettings 
                    userId={currentUserId} 
                    username={profile.username}
                    isGuest={profile.isGuest}
                    onActiveStateChange={(active) => {
                      setIs2FAFlowActive(active);
                      if (active) setShowSetupImmediately(true);
                    }}
                  />
                </div>
              )}

              {/* Stats */}
              {profile.stats && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-gray-900 dark:text-white">Stats</h4>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{profile.stats.gamesPlayed}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Games Played</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">{profile.stats.wins}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Wins</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">{profile.stats.losses}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Losses</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              {!isOwnProfile && (
                <div className="flex gap-2">
                  <button 
                    onClick={handleAddFriend}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Add Friend
                  </button>
                  <button
                    onClick={() => {
                      if (onStartDM && userId) {
                        onStartDM(userId)
                        onClose()
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-50 dark:hover:bg-dark-600 transition-colors"
                  >
                    Send Message
                  </button>
                </div>
              )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="py-8 px-6 text-center text-gray-500 dark:text-gray-400">Profile not found</div>
        )}
      </div>
    </div>
  )
}