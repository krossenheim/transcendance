import { create } from "zustand";

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
    id: string;
    type: ToastType;
    message: string;
    endTime: number;
};

interface ToastStoreState {
    toasts: ToastMessage[];

    showToast: (message: string, type?: ToastType, durationMs?: number) => void;
    removeToast: (id: string) => void;
};

export const useToastStore = create<ToastStoreState>((set) => ({
    toasts: [],

    showToast: (message: string, type: ToastType = 'info', durationMs = 6000) => {
        const endTime = Date.now() + durationMs;
        const id = Math.random().toString(36);
        set((state) => ({
            toasts: [...state.toasts, { id, type, message, endTime }],
        }));
    },

    removeToast: (id: string) => {
        set((state) => ({
            toasts: state.toasts.filter((toast) => toast.id !== id),
        }));
    },
}));

export const toast = {
    success: (message: string, durationMs?: number) => useToastStore.getState().showToast(message, 'success', durationMs),
    error: (message: string, durationMs?: number) => useToastStore.getState().showToast(message, 'error', durationMs),
    info: (message: string, durationMs?: number) => useToastStore.getState().showToast(message, 'info', durationMs),
};

