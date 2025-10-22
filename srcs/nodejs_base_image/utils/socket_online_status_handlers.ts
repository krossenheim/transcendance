import { int_url } from "./api/service/common/endpoints";
import { Result } from "./api/service/common/result";
import { FullUserType } from "./api/service/db/user";
import { OurSocket } from "./socket_to_hub";

class OnlineUserStatus {
  private user_list: Array<FullUserType>;

  constructor(socket: OurSocket) {
    socket.registerEvent(
      int_url.ws.serviceProviders.userConnected,
      async (body) => {
        return Result.Ok(null);
      }
    );
    socket.registerEvent(
      int_url.ws.serviceProviders.userDisconnected,
      async (body) => {
        return Result.Ok(null);
      }
    );

    user_list = getCompleteOnlineUserList(socket);
  }
}
