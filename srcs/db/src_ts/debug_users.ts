import { hashPassword } from "./routes/users.js";

export async function makedebugusers(userService: any): Promise<void> {
  const hashed = await hashPassword("apassword");
  const safedebugpasswords = [];

  userService.createNewUser("userone", "boasgus@bogii.coms", hashed, false);
  userService.createNewUser("usertwo", "bogasdus@bog2ii.coms", hashed, false);
  userService.createNewUser(
    "userthree",
    "bogdssus@bog2isi.coms",
    hashed,
    false
  );
  userService.createNewUser("pong", "pong@bogii.coms", hashed, false);
  userService.createNewUser("pong1", "po1ng@bogii.coms", hashed, false);
  userService.createNewUser("pong2", "po2ng@bogii.coms", hashed, false);
  userService.createNewUser("pong3", "pon3g@bogii.coms", hashed, false);
  userService.createNewUser("pong4", "pon4g@bogii.coms", hashed, false);
  userService.createNewUser("guest", "bogdssus@bog2isi.coms", hashed, false);
}
