import { UserAccountType } from "./utils/api/service/db/user.js";
import { hashPassword } from "./routes/users.js";

export async function makedebugusers(userService: any): Promise<void> {
  userService.createNewUser("userone", "boasgus@bogii.coms", await hashPassword("apassword"), UserAccountType.User);
  userService.createNewUser("usertwo", "bogasdus@bog2ii.coms", await hashPassword("apassword"), UserAccountType.User);
  userService.createNewUser("userthree", "bogdssus@bog2isi.coms", await hashPassword("apassword"), UserAccountType.User);
  userService.createNewUser("pong", "pong@bogii.coms", await hashPassword("apassword"), UserAccountType.User);
  userService.createNewUser("pong1", "po1ng@bogii.coms", await hashPassword("apassword"), UserAccountType.User);
  userService.createNewUser("pong2", "po2ng@bogii.coms", await hashPassword("apassword"), UserAccountType.User);
  userService.createNewUser("pong3", "pon3g@bogii.coms", await hashPassword("apassword"), UserAccountType.User);
  userService.createNewUser("pong4", "pon4g@bogii.coms", await hashPassword("apassword"), UserAccountType.User);
  userService.createNewUser("guest", "bogdssus@bog2isi2.coms", await hashPassword("apassword"), UserAccountType.Guest);
}
