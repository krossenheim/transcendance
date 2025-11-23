import { int_url, user_url } from "../utils/api/service/common/endpoints.js";
import { Result } from "../utils/api/service/common/result.js";
import { OurSocket } from "../utils/socket_to_hub.js";

import containers from "../utils/internal_api.js";

import type { FullUserType } from "../utils/api/service/db/user.js";
import type { ErrorResponseType } from "../utils/api/service/common/error.js";

// {"funcId":"update_profile","payload":{"bio":"Lazy af"},"target_container":"users"}
export function updateProfile(socket: OurSocket) {
	socket.registerHandler(
		user_url.ws.users.updateProfile,
		async (body) => {
			const updateResult = await containers.db.post(
                int_url.http.db.updateUserData,
                { ...body.payload, userId: body.user_id }
            );

            if (updateResult.isErr()) {
                return Result.Ok({
                    recipients: [body.user_id],
                    code: 1,
                    payload: { message: updateResult.unwrapErr() } as ErrorResponseType
                });
            }

            const newUser = updateResult.unwrap().data;
            return Result.Ok({
                recipients: [body.user_id],
                code: 0,
                payload: newUser as FullUserType
            });
		}
	);
}