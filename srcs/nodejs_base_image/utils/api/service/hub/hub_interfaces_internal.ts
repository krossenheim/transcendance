import { z } from "zod";

export const InterContainerRequestSchema = z.object({
  internalFuncId: z.number(),
  payload: z.any(),
});

