import { int_url, user_url } from "../utils/api/service/common/endpoints.js";
import { Friend, type FriendType } from "../utils/api/service/db/user.js";
import { zodParse } from "../utils/api/service/common/zodUtils.js";
import { Result } from "../utils/api/service/common/result.js";
import { OurSocket } from "../utils/socket_to_hub.js";

import containers from "../utils/internal_api.js";
import { UserFriendshipStatusEnum } from "../utils/api/service/db/friendship.js";

export function wsFetchUserConnectionsHandlers(socket: OurSocket, onlineUsers: Set<number>) {
  socket.registerHandler(
    user_url.ws.users.fetchUserConnections,
    async (body, schema) => {
      const connectionsResult = await containers.db.get(
        int_url.http.db.fetchUserConnections,
        { userId: body.user_id }
      );

      if (connectionsResult.isErr()) {
        return Result.Ok({
          recipients: [body.user_id],
          code: schema.output.Failure.code,
          payload: { message: "Failed to fetch user connections" },
        });
      }

      const result = connectionsResult.unwrap();
      if (result.status !== 200)
        return Result.Ok({
          recipients: [body.user_id],
          code: schema.output.Failure.code,
          payload: { message: "Failed to fetch user connections" },
        });
      
      console.log(`Online users: ${Array.from(onlineUsers).join(", ")}`);
      const friends = result.data.map((friend: FriendType) => {
        if (friend.status == UserFriendshipStatusEnum.Accepted)
          return { ...friend, onlineStatus: onlineUsers.has(friend.friendId) ? 1 : 0 } as FriendType;
        return friend;
      });

      return Result.Ok({
        recipients: [body.user_id],
        code: schema.output.Success.code,
        payload: zodParse(int_url.http.db.fetchUserConnections.schema.response[200], friends).unwrapOr([]),
      });
    }
  );
}