"use client"

import { ChatRoomUserAccessType } from "@app/shared/api/service/chat/db_models";

import { user_url } from "@app/shared/api/service/common/endpoints";
import { useWebSocket, HandlerResult } from "@src/socketComponent";
import { useChatStore } from "@src/features/chat/store/chatStore";
import { useGlobalStore } from "@src/features/global/store/globalStore";
import { toast } from "@src/features/toast/toastStore";
import { useEffect } from "react";

export const ChatSocketListeners = () => {
    const { subscribe, sendMessage } = useWebSocket();

    useEffect(() => {
      const unsubs: Array<() => void> = []

      unsubs.push(subscribe(user_url.ws.chat.listRooms, (message, schema) => {
        if (message.code === schema.output.FullListGiven.code) {
          const chatStore = useChatStore.getState()
          chatStore.rooms.state.updateFullRoomList(message.payload)

          return HandlerResult.Handled
        }
        return HandlerResult.NotHandled
      }))

      unsubs.push(subscribe(user_url.ws.chat.getRoomData, (message, schema) => {
        if (message.code === schema.output.RoomDataProvided.code) {
          const chatStore = useChatStore.getState()
          chatStore.rooms.state.updateSingleRoom(message.payload.room)
          chatStore.rooms.state.setCurrentRoomId(message.payload.room.roomId)
          chatStore.rooms.state.updateUnreadCountForRoom(message.payload.room.roomId, 0)
          chatStore.rooms.state.updateRoomUserConnections(message.payload.userConnections)

          chatStore.messages.state.setMessagesForRoom(message.payload.room.roomId, message.payload.messages)

          const globalStore = useGlobalStore.getState()
          globalStore.users.state.cachePublicUserData(message.payload.users)

          return HandlerResult.Handled
        }
        return HandlerResult.NotHandled
      }))

      unsubs.push(subscribe(user_url.ws.chat.sendMessage, (message, schema) => {
        if (message.code === schema.output.MessageSent.code) {
          const chatStore = useChatStore.getState()
          chatStore.messages.state.addMessageToRoom(message.payload)

          return HandlerResult.Handled
        }
        return HandlerResult.NotHandled
      }))

      unsubs.push(subscribe(user_url.ws.chat.addRoom, (message, schema) => {
        if (message.code === schema.output.AddedRoom.code) {
          const chatStore = useChatStore.getState()
          chatStore.rooms.state.updateSingleRoom(message.payload)

          sendMessage(user_url.ws.chat.getRoomData, { roomId: message.payload.roomId })

          return HandlerResult.Handled
        }
        return HandlerResult.NotHandled
      }))

      unsubs.push(subscribe(user_url.ws.chat.sendDirectMessage, (message, schema) => {
        if (message.code === schema.output.MessageSent.code) {
          sendMessage(user_url.ws.chat.getRoomData, { roomId: message.payload.roomId })
          return HandlerResult.Handled
        }
        return HandlerResult.NotHandled
      }))

      unsubs.push(subscribe(user_url.ws.chat.leaveRoom, (message, schema) => {
        if (message.code === schema.output.RoomLeft.code) {
          const chatStore = useChatStore.getState()
          chatStore.rooms.state.userLeftRoom(message.payload.roomId)

          return HandlerResult.Handled
        }
        return HandlerResult.NotHandled
      }))

      unsubs.push(subscribe(user_url.ws.chat.joinRoom, (message, schema) => {
        if (message.code === schema.output.RoomJoined.code) {
          const chatStore = useChatStore.getState()
          if (chatStore.rooms.data.currentRoomId === message.payload.roomId)
            chatStore.rooms.state.updateUserRoomState(message.payload.user, ChatRoomUserAccessType.JOINED)

          chatStore.rooms.actions.fetchRoomData(message.payload.roomId)

          return HandlerResult.Handled
        }
        return HandlerResult.NotHandled
      }))

      unsubs.push(subscribe(user_url.ws.chat.addUserToRoom, (message, schema) => {
        if (message.code === schema.output.UserAdded.code) {
          const chatStore = useChatStore.getState()
          if (chatStore.rooms.data.currentRoomId === message.payload.roomId)
            chatStore.rooms.state.updateUserRoomState(message.payload.user, ChatRoomUserAccessType.INVITED)

          const currentUserId = useGlobalStore.getState().me.data.currentUserId
          if (message.payload.user !== currentUserId) {
            toast.success(`User invited to room successfully`);
          }
          return HandlerResult.Handled
        }
        if (message.code === schema.output.NoSuchRoom.code) {
          toast.error(message.payload.message || "Room not found");
          return HandlerResult.Handled
        }
        if (message.code === schema.output.UnknownUser.code) {
          toast.error(message.payload.message || "User not found");
          return HandlerResult.Handled
        }
        if (message.code === schema.output.FailedToAddUser.code) {
          toast.error(message.payload.message || "Failed to invite user");
          return HandlerResult.Handled
        }
        if (message.code === schema.output.AlreadyInRoom.code) {
          toast.info(message.payload.message || "User is already in the room");
          return HandlerResult.Handled
        }
        if (message.code === schema.output.NotInRoom.code) {
          toast.error(message.payload.message || "You are not in this room");
          return HandlerResult.Handled
        }
        return HandlerResult.NotHandled
      }))

      return () => {
        unsubs.forEach((unsub) => unsub())
      }
  }, [subscribe, sendMessage])

  return null
}

