import { user_url, int_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import containers from "@app/shared/internal_api";
import { OurSocket } from "@app/shared/socket_to_hub";

export function wsFetchUserMatchHistoryHandlers(socket: OurSocket) {
  socket.registerHandler(
    user_url.ws.users.fetchUserMatchHistory,
    async (body, response) => {
      const targetUserId = body.payload;

      if (typeof targetUserId !== "number") {
        return Result.Ok(response.select("Failure").reply({
          message: "Invalid user id",
        }));
      }

      const userExistsResult = await containers.db.get(int_url.http.db.getUser, { userId: targetUserId });
      if (userExistsResult.isErr() || userExistsResult.unwrap().status !== 200) {
        return Result.Ok(response.select("Failure").reply({
          message: "User not found",
        }));
      }

      const matchHistoryResp = await containers.db.get(int_url.http.db.fetchUserMatchHistory, { userId: targetUserId });
      if (matchHistoryResp.isErr() || matchHistoryResp.unwrap().status !== 200) {
        return Result.Ok(response.select("Failure").reply({
          message: "Failed to fetch match history",
        }));
      }

      const matchHistory = matchHistoryResp.unwrap().data;
      return Result.Ok(response.select("Success").reply(
        matchHistory
      ));
    }
  );
}

export default wsFetchUserMatchHistoryHandlers;

