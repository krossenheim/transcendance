import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { type FriendType } from "@app/shared/api/service/db/user";
import { Result } from "@app/shared/api/service/common/result";
import { OurSocket } from "@app/shared/socket_to_hub";

import containers from "@app/shared/internal_api";

export function wsFetchUserConnectionsHandlers(socket: OurSocket, onlineUsers: Set<number>) {
  socket.registerHandler(
    user_url.ws.users.fetchUserConnections,
    async (body, response) => {
      const connectionsResult = await containers.db.get(
        int_url.http.db.fetchUserConnections,
        { userId: body.user_id }
      );

      if (connectionsResult.isErr()) {
        return Result.Ok(response.select("Failure").reply({
          message: "Failed to fetch user connections",
        }));
      }

      const result = connectionsResult.unwrap();
      if (result.status !== 200)
        return Result.Ok(response.select("Failure").reply({
          message: "Failed to fetch user connections",
        }));

      const friends = result.data.map((friend: FriendType) => {
        return { ...friend, onlineStatus: onlineUsers.has(friend.friendId) ? 1 : 0 } as FriendType;
      });

      return Result.Ok(response.select("Success").reply(
        friends
      ));
    }
  );
}