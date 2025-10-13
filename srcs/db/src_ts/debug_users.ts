import { hashPassword } from "./routes/users.js";

export async function makedebugusers(userService: any): Promise<void> {
  const safedebugpasswords = [];
  safedebugpasswords.push(
    await userService.createNewUser(
      "userone",
      "bogus@bogii.coms",
      await hashPassword("apassword"),
      false
    )
  );
  safedebugpasswords.push(
    await userService.createNewUser(
      "usertwo",
      "bogus@bog2ii.coms",
      await hashPassword("apassword"),
      true
    )
  );
  safedebugpasswords.push(
    await userService.createNewUser(
      "userthree",
      "bogus@bog2isi.coms",
      await hashPassword("apassword"),
      true
    )
  );
}
