"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface User {
  id: string
  username: string
  lastSeen?: Date
  isOnline?: boolean
}

interface UserListProps {
  users: User[]
  currentUser: User
  getUserLastSeen?: (userId: string) => Date | null
  isUserOnline?: (userId: string) => boolean
}

export function UserList({ users, currentUser, getUserLastSeen, isUserOnline }: UserListProps) {
  // Sort users with current user first, then by online status, then alphabetically
  const sortedUsers = [...users].sort((a, b) => {
    if (a.id === currentUser.id) return -1
    if (b.id === currentUser.id) return 1

    const aOnline = isUserOnline ? isUserOnline(a.id) : a.isOnline
    const bOnline = isUserOnline ? isUserOnline(b.id) : b.isOnline

    if (aOnline && !bOnline) return -1
    if (!aOnline && bOnline) return 1

    return a.username.localeCompare(b.username)
  })

  const formatLastSeen = (lastSeen: Date | null) => {
    if (!lastSeen) return "Never"

    const now = new Date()
    const diff = now.getTime() - lastSeen.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Users</h3>
          <Badge variant="secondary" className="text-xs">
            {users.length}
          </Badge>
        </div>

        {users.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">No users online</div>
        ) : (
          <div className="space-y-2">
            {sortedUsers.map((user) => {
              const isOnline = isUserOnline ? isUserOnline(user.id) : user.isOnline
              const lastSeen = getUserLastSeen ? getUserLastSeen(user.id) : user.lastSeen

              return (
                <Tooltip key={user.id}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 p-1 rounded hover:bg-muted/50 cursor-pointer">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="text-xs">{user.username.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm flex-1 truncate">
                        {user.id === currentUser.id ? "You" : user.username}
                      </span>
                      <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-gray-400"}`} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <div className="text-xs">
                      <div className="font-medium">{user.username}</div>
                      <div className="text-muted-foreground">
                        {isOnline ? "Online" : `Last seen: ${formatLastSeen(lastSeen)}`}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
