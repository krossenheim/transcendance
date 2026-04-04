import { UserAccountType } from "@app/shared/api/service/db/user";
import { hashPassword } from "./routes/users.js";

export async function makedebugusers(userService: any): Promise<void> {
  // Debug users for development/testing
  await userService.createNewUser("userone", "boasgus@bogii.coms", await hashPassword("apassword"), UserAccountType.User);
  await userService.createNewUser("usertwo", "bogasdus@bog2ii.coms", await hashPassword("apassword"), UserAccountType.User);
  await userService.createNewUser("userthree", "bogdssus@bog2isi.coms", await hashPassword("apassword"), UserAccountType.User);
  await userService.createNewUser("pong", "pong@bogii.coms", await hashPassword("apassword"), UserAccountType.User);
  await userService.createNewUser("pong1", "po1ng@bogii.coms", await hashPassword("apassword"), UserAccountType.User);
  await userService.createNewUser("pong2", "po2ng@bogii.coms", await hashPassword("apassword"), UserAccountType.User);
  await userService.createNewUser("pong3", "pon3g@bogii.coms", await hashPassword("apassword"), UserAccountType.User);
  await userService.createNewUser("pong4", "pon4g@bogii.coms", await hashPassword("apassword"), UserAccountType.User);
  await userService.createNewUser("guest", "bogdssus@bog2isi2.coms", await hashPassword("apassword"), UserAccountType.Guest);
}
