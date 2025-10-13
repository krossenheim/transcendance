import { hashPassword } from "./routes/users.js";

export async function makedebugusers(userService: any): Promise<void> {
  const hashed = await hashPassword("apassword");
  const safedebugpasswords = [];
  safedebugpasswords.push(
    userService.createNewUser("userone", "boasgus@bogii.coms", hashed, false)
  );
  safedebugpasswords.push(
    userService.createNewUser("usertwo", "bogasdus@bog2ii.coms", hashed, false)
  );
  safedebugpasswords.push(
    userService.createNewUser(
      "userthree",
      "bogdssus@bog2isi.coms",
      hashed,
      false
    )
  );
  safedebugpasswords.push(
    userService.createNewUser("guest", "bogdssus@bog2isi.coms", hashed, false)
  );
}
