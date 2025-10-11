import { z } from "zod";

// Ids are always positive integers
export const gameIdValue = z.number().min(1);
export const userIdValue = z.number().min(1);