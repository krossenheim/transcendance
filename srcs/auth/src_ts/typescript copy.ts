export interface User {
	id: number;
	username: string;
	email: string;
	isActive: boolean;
}

export type AuthResponse = {
	token: string;
	user: User;
};

export function isAuthenticated(response: AuthResponse): boolean {
	return !!response.token && response.user.isActive;
}