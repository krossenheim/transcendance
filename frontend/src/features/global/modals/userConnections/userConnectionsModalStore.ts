import { create } from "zustand";

interface UserConnectionsModalState {
    isOpen: boolean;

    openUserConnectionsModal: () => void;
    closeUserConnectionsModal: () => void;
}

export const useUserConnectionsModalStore = create<UserConnectionsModalState>((set) => ({
    isOpen: false,

    openUserConnectionsModal: () => {
        set(() => ({
            isOpen: true,
        }));
    },

    closeUserConnectionsModal: () => {
        set(() => ({
            isOpen: false,
        }));
    },
}));

