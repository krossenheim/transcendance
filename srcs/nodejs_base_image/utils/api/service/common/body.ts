import { z } from 'zod';

export const Body = <T extends z.ZodTypeAny>(dataType: T) => z.object({
    userId: z.number().min(1),
    data: dataType,
}).strict();

export type BodyType<T extends z.ZodTypeAny> = z.infer<typeof Body<T>>;

export default {
	Body,
};