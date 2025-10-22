import { int_url } from "./api/service/common/endpoints";
import { Result } from "./api/service/common/result";
import user, { FullUserType } from "./api/service/db/user";
import { OurSocket } from "./socket_to_hub";

class OnlineUserStatus {
  private user_list: Map<number, FullUserType> = new Map();

  constructor(socket: OurSocket) {
    socket.registerEvent(int_url.ws.hub.userConnected, async (body) => {
      this.user_list.set(body.);
      return Result.Ok(null);
    });
    socket.registerEvent(int_url.ws.hub.userDisconnected, async (body) => {
      return Result.Ok(null);
    });
    socket.registerEvent(int_url.ws.hub.getOnlineUsers, async (body) => {
      return Result.Ok(null);
    });
  }
}
