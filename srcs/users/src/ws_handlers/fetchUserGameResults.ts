import { user_url, int_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import containers from "@app/shared/internal_api";
import { OurSocket } from "@app/shared/socket_to_hub";

// Handler for fetching a user's game results (match history)
export function wsFetchUserGameResultsHandlers(socket: OurSocket) {
  socket.registerHandler(
    user_url.ws.users.fetchUserGameResults,
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

      const gameResultsResp = await containers.db.get(int_url.http.db.fetchUserGameResults, { userId: targetUserId });
      if (gameResultsResp.isErr() || gameResultsResp.unwrap().status !== 200) {
        return Result.Ok(response.select("Failure").reply({
          message: "Failed to fetch game results",
        }));
      }

      const gameResults = gameResultsResp.unwrap().data;
      return Result.Ok(response.select("Success").reply(
        gameResults
      ));
    }
  );
}

export default wsFetchUserGameResultsHandlers;