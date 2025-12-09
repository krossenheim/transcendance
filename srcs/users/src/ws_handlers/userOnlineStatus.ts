import { UserFriendshipStatusEnum } from "@app/shared/api/service/db/friendship";
import { user_url } from "@app/shared/api/service/common/endpoints";
import { int_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { OurSocket } from "@app/shared/socket_to_hub";

import containers from "@app/shared/internal_api";

import type { FriendType } from "@app/shared/api/service/db/user";

export async function fetchAllowedOnlineStatusViewers(userId: number): Promise<Array<number>> {
  const allowedViewers: Set<number> = new Set([userId]);

  const userConnections = await containers.db.get(
    int_url.http.db.fetchUserConnections,
    { userId: userId }
  );

  if (userConnections.isOk() && userConnections.unwrap().status === 200) {
    const result_array = userConnections.unwrap().data as Array<FriendType>;
    for (const friend of result_array) {
      if (friend.status === UserFriendshipStatusEnum.Accepted) {
        allowedViewers.add(friend.friendId);
      }
    }
  }

  let chatConnections = await containers.chat.get(
    int_url.http.chat.getUserConnections,
    { userId: userId }
  );

  if (chatConnections.isOk() && chatConnections.unwrap().status === 200) {
    const result_array = chatConnections.unwrap().data as Array<number>;
    for (const uid of result_array) {
      allowedViewers.add(uid);
    }
  }

  return Array.from(allowedViewers);
}

// {"funcId":"user_online_status_update","payload":null,"target_container":"users"}
export function wsUserOnlineStatusHandler(socket: OurSocket, onlineUsers: Set<number>) {
	socket.registerHandler(
		user_url.ws.users.userOnlineStatusUpdate,
		async (body, response) => {
      const allowedViewers = await fetchAllowedOnlineStatusViewers(body.user_id);
      return Result.Ok(response.select("GetOnlineUsers").reply(
        Array.from(allowedViewers).filter((uid) => onlineUsers.has(uid))
      ));
		}
	);
}