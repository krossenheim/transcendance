import { z } from "zod";

// Ids are always positive integers
export const idValue = z.coerce.number().min(1);
export const gameIdValue = z.coerce.number().min(1);
export const userIdValue = z.coerce.number().min(1);

