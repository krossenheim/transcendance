import { createGlobalUsersSlice } from "./slices/users";
import { createGlobalMeSlice } from "./slices/me";
import { immer } from "zustand/middleware/immer";
import { GlobalStoreState } from "./types";
import { create } from "zustand";

export const useGlobalStore = create<GlobalStoreState>()(immer((...a) => ({
    ...createGlobalUsersSlice(...a),
    ...createGlobalMeSlice(...a),
})));

