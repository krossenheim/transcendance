import { create } from "zustand";

interface ProfileModalState {
    isOpen: boolean;
    targetUserId: number | null;

    openProfileModal: (userId: number) => void;
    closeProfileModal: () => void;
}

export const useProfileModalStore = create<ProfileModalState>((set) => ({
    isOpen: false,
    targetUserId: null,

    openProfileModal: (userId: number) => {
        set(() => ({
            isOpen: true,
            targetUserId: userId,
        }));
    },

    closeProfileModal: () => {
        set(() => ({
            isOpen: false,
            targetUserId: null,
        }));
    },
}));

