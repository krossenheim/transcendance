import { z } from "zod";

// Ids are always positive integers
export const idValue = z.coerce.number().int().min(1);
export const gameIdValue = z.coerce.number().int().min(0);
export const userIdValue = z.coerce.number().int().min(1);
// Allows negative IDs for virtual players (AI: -1001.., Guest: -999, Local: -500..)
export const anyPlayerIdValue = z.coerce.number().int();
export const usernameValue = z.coerce.string().min(3).max(30);
export const userIdentifierValue = z.union([idValue, usernameValue]);

export type TypeUserIdentifier = z.infer<typeof userIdentifierValue>;