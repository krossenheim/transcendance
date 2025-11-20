import { user_url } from "../utils/api/service/common/endpoints.js";
import { Result } from "../utils/api/service/common/result.js";
import { OurSocket } from "../utils/socket_to_hub.js";
import containers from "../utils/internal_api.js";
import { int_url } from "../utils/api/service/common/endpoints.js";

export function wsSearchUserByUsernameHandlers(socket: OurSocket, onlineUsers: Set<number>) {
  socket.registerHandler(
    user_url.ws.users.searchUserByUsername,
    async (body, schema) => {
      const username = body.payload.username;
      
      // Call the DB service to search for the user
      const searchResult = await containers.db.get(
        int_url.http.db.searchUserByUsername,
        { username }
      );

      if (searchResult.isErr()) {
        return Result.Ok({
          recipients: [body.user_id],
          code: schema.output.UserNotFound.code,
          payload: { message: "Failed to search for user" },
        });
      }

      const response = searchResult.unwrap();
      
      if (response.status === 404) {
        return Result.Ok({
          recipients: [body.user_id],
          code: schema.output.UserNotFound.code,
          payload: { message: `User "${username}" not found` },
        });
      }

      if (response.status !== 200) {
        return Result.Ok({
          recipients: [body.user_id],
          code: schema.output.UserNotFound.code,
          payload: { message: "Failed to retrieve user data" },
        });
      }

      const userData = response.data;
      
      return Result.Ok({
        recipients: [body.user_id],
        code: schema.output.UserFound.code,
        payload: {
          id: userData.id,
          createdAt: userData.createdAt,
          username: userData.username,
          alias: userData.alias,
          bio: userData.bio,
          hasAvatar: userData.hasAvatar,
          onlineStatus: onlineUsers.has(userData.id) ? 1 : 0,
        },
      });
    }
  );
}
