import { user_url, int_url } from "../utils/api/service/common/endpoints.js";
import { Result } from "../utils/api/service/common/result.js";
import containers from "../utils/internal_api.js";
import { OurSocket } from "../utils/socket_to_hub.js";

// Handler for fetching a user's game results (match history)
export function wsFetchUserGameResultsHandlers(socket: OurSocket) {
  socket.registerHandler(
    user_url.ws.users.fetchUserGameResults,
    async (body: any, schema: any) => {
      const requestingUserId = body.user_id; // who requested
      const targetUserId = body.payload; // whose history is requested

      // Basic validation: allow requesting own or others' history (could restrict later)
      if (typeof targetUserId !== "number") {
        return Result.Ok({
          recipients: [requestingUserId],
          code: schema.output.Failure.code,
          payload: { message: "Invalid user id" },
        });
      }

      const userExistsResult = await containers.db.get(int_url.http.db.getUser, { userId: targetUserId });
      if (userExistsResult.isErr() || userExistsResult.unwrap().status !== 200) {
        return Result.Ok({
          recipients: [requestingUserId],
          code: schema.output.Failure.code,
          payload: { message: "User not found" },
        });
      }

      const gameResultsResp = await containers.db.get(int_url.http.db.fetchUserGameResults, { userId: targetUserId });
      if (gameResultsResp.isErr() || gameResultsResp.unwrap().status !== 200) {
        return Result.Ok({
          recipients: [requestingUserId],
          code: schema.output.Failure.code,
          payload: { message: "Failed to fetch game results" },
        });
      }
      const gameResults = gameResultsResp.unwrap().data;

      return Result.Ok({
        recipients: [requestingUserId],
        code: schema.output.Success.code,
        payload: gameResults,
      });
    }
  );
}

export default wsFetchUserGameResultsHandlers;