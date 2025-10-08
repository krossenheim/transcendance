"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, UserPlus } from "lucide-react"

interface RoomManagerProps {
  onRoomCreated: (roomName: string) => void
  currentRoom: string
  sendMessage: (data: any) => void
  isConnected: boolean
}

export function RoomManager({ onRoomCreated, currentRoom, sendMessage, isConnected }: RoomManagerProps) {
  const [newRoomName, setNewRoomName] = useState("")
  const [userToAdd, setUserToAdd] = useState("")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false)

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoomName.trim() || !isConnected) return

    const roomName = newRoomName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")

    if (!roomName) {
      // Show error if no valid characters remain
      return
    }

    console.log("[v0] Creating room:", roomName)
    sendMessage({
      endpoint: "/api/chat/add_a_new_room",
      room_name: roomName,
    })

    onRoomCreated(roomName)
    setNewRoomName("")
    setIsCreateDialogOpen(false)
  }

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!userToAdd.trim() || !isConnected) return

    const userIdToAdd = Number.parseInt(userToAdd.trim(), 10)
    if (isNaN(userIdToAdd)) {
      return // Invalid number
    }

    sendMessage({
      endpoint: "/api/chat/add_to_room",
      room_name: currentRoom,
      user_to_add: userIdToAdd,
    })

    setUserToAdd("")
    setIsAddUserDialogOpen(false)
  }

  const handleJoinCurrentRoom = () => {
    if (!currentRoom || !isConnected) return

    sendMessage({
      endpoint: "/api/chat/add_to_room",
      room_name: currentRoom,
      user_to_add: 0, // Will be replaced by parent with actual user ID
    })
  }

  return (
    <div className="space-y-2">
      {/* Create Room Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full bg-transparent" disabled={!isConnected}>
            <Plus className="w-4 h-4 mr-2" />
            Create Room
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Room</DialogTitle>
            <DialogDescription>
              Create a new chat room. Room names must contain only letters and numbers.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateRoom} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="room-name">Room Name</Label>
              <Input
                id="room-name"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Enter room name..."
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newRoomName.trim()}>
                Create Room
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full bg-transparent" disabled={!isConnected}>
            <UserPlus className="w-4 h-4 mr-2" />
            Invite User
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User to #{currentRoom}</DialogTitle>
            <DialogDescription>Enter the username of the person you want to invite to this room.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-to-add">User ID</Label>
              <Input
                id="user-to-add"
                value={userToAdd}
                onChange={(e) => setUserToAdd(e.target.value)}
                placeholder="Enter user ID (number)..."
                type="number"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsAddUserDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!userToAdd.trim()}>
                Send Invite
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Join Current Room Button
      <Button
        variant="outline"
        size="sm"
        className="w-full bg-transparent"
        disabled={!isConnected}
        onClick={handleJoinCurrentRoom}
      >
        Join Room #{currentRoom}
      </Button> */}
    </div>
  )
}
