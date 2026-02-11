

export interface GlobalMeData {
    currentUserId: number | null;
    jwtToken: string | null;
}

export interface GlobalMeActions {
    fetchUserConnections: () => void;
}

export interface GlobalMeStates {
    setCurrentUserId: (userId: number | null) => void;
    setJwtToken: (token: string | null) => void;
}

export interface GlobalMeSlice {
    me: {
        data: GlobalMeData;
        actions: GlobalMeActions;
        state: GlobalMeStates;
    };
};
