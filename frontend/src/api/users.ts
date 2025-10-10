// frontend/src/api/users.ts
import { UserSchema, type User } from '@shared/schemas';

export async function fetchUser(id: number): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  const data = await response.json();
  return UserSchema.parse(data); // Validates the API response
}