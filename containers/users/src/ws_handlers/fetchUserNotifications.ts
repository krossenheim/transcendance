import type { UserNotificationsType } from "@app/shared/api/service/db/notification";
import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { OurSocket } from "@app/shared/socket_to_hub";

import containers from "@app/shared/internal_api";

export function wsFetchUserNotifications(socket: OurSocket, onlineUsers: Set<number>) {
  socket.registerHandler(
	user_url.ws.users.fetchUserNotifications,
	async (body, response) => {
	  const notificationsResult = await containers.db.get(
		int_url.http.db.getUserNotifications,
		{ userId: body.userId }
	  );

	  if (notificationsResult.isErr() || notificationsResult.unwrap().status !== 200) {
		return Result.Ok(response.select("Failure").reply({
		  message: "Failed to fetch user notifications",
		}));
	  }

	  return Result.Ok(response.select("Success").reply(
		notificationsResult.unwrap().data as UserNotificationsType
	  ));
	}
  );
}

