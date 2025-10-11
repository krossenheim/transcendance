import { z } from 'zod';
import { userIdValue } from './zodRules.js';

export const Body = <T extends z.ZodTypeAny>(dataType: T) => z.object({
    userId: userIdValue,
    data: dataType,
}).strict();

export type BodyType<T extends z.ZodTypeAny> = z.infer<typeof Body<T>>;

export default {
	Body,
};