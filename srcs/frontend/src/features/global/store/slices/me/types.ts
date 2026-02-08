import { UpdateUserDataType } from "@app/shared/api/service/db/user";
import { FullUserType } from "@app/shared/api/service/db/user";

export interface GlobalMeData {
    currentUserData: FullUserType | null;
    currentUserId: number | null;
    jwtToken: string | null;
}

export interface GlobalMeActions {
    fetchUserConnections: () => void;
    updateProfileData: (data: Omit<UpdateUserDataType, "pfp">, rawPfp: File | null) => Promise<void>;
}

export interface GlobalMeStates {
    setCurrentUserData: (userData: FullUserType) => void;
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
