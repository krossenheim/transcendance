import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { OurSocket } from "@app/shared/socket_to_hub";

import containers from "@app/shared/internal_api";

import type { FullUserType } from "@app/shared/api/service/db/user";
import type { ErrorResponseType } from "@app/shared/api/service/common/error";

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