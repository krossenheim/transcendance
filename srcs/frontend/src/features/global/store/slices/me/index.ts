import { user_url } from "@app/shared/api/service/common/endpoints";
import { getSocketSenderRef } from "@utils/socketRef";
import { GlobalStoreState } from "../../types";
import { GlobalMeSlice } from "./types";
import { StateCreator } from "zustand";

export const createGlobalMeSlice: StateCreator<GlobalStoreState, [["zustand/immer", never]], [], GlobalMeSlice> = (set, get) => ({
    me: {
        data: {
            currentUserId: null,
            jwtToken: null,
        },

        actions: {
            fetchUserConnections: () => {
                getSocketSenderRef()(user_url.ws.users.fetchUserConnections, null);
            },
        },

        state: {
            setCurrentUserId: (userId: number | null) => {
                set((state) => {
                    state.me.data.currentUserId = userId;
                });
            },

            setJwtToken: (token: string | null) => {
                set((state) => {
                    state.me.data.jwtToken = token;
                });
            },
        },
    },
});