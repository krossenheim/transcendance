import { GlobalUserSlice } from "./slices/users/types";
import { GlobalMeSlice } from "./slices/me/types";

export type GlobalStoreState = GlobalUserSlice & GlobalMeSlice;