// Minimal endpoints shim for frontend usage.
// Provides `user_url` with the funcId strings and containers used by the frontend.

export const user_url = {
  ws: {
    chat: {
      sendMessage: { funcId: "/api/chat/send_message_to_room", container: "chat" },
      listRooms: { funcId: "/api/chat/list_rooms", container: "chat" },
      getRoomData: { funcId: "/api/chat/get_room_data", container: "chat" },
      addRoom: { funcId: "/api/chat/add_a_new_room", container: "chat" },
      joinRoom: { funcId: "/api/chat/join_room", container: "chat" },
      leaveRoom: { funcId: "/api/chat/leave_room", container: "chat" },
      addUserToRoom: { funcId: "/api/chat/add_user_to_room", container: "chat" },
      sendDirectMessage: { funcId: "/api/chat/send_direct_message", container: "chat" },
    },
    users: {
      fetchUserConnections: { funcId: "ws.users.fetchUserConnections", container: "users" },
      fetchUserGameResults: { funcId: "ws.users.fetchUserGameResults", container: "users" },
      requestUserProfileData: { funcId: "ws.users.requestUserProfileData", container: "users" },
      confirmFriendship: { funcId: "ws.users.confirmFriendship", container: "users" },
      denyFriendship: { funcId: "ws.users.denyFriendship", container: "users" },
      blockUser: { funcId: "ws.users.blockUser", container: "users" },
      unblockUser: { funcId: "ws.users.unblockUser", container: "users" },
    },
    pong: {
      getGameState: {
        funcId: "get_game_state",
        container: "pong",
        schema: {
          output: {
            GameUpdate: { code: 0 },
            NotInRoom: { code: 1 },
          },
        },
      },
      handleGameKeys: { funcId: "handle_game_keys", container: "pong" },
      startGame: { funcId: "start_game", container: "pong" },
      userReportsReady: { funcId: "report_ready_for_pong_game", container: "pong" },
    },
  },
  http: {
    users: {
      fetchUserAvatar: { endpoint: "/public_api/users/avatar" },
    },
  },
}

export default user_url
