// backend/src/users/users.service.ts
import { type User } from '@shared/schemas';

async findOne(id: number): Promise<User> {
  return this.userRepository.findOne(id);
}