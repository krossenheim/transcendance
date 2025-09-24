import { z } from "zod";

export const AddUserToRoomPayloadSchema = z
  .object({
    room_name: z.string(),
    user_to_add: z.number(),
  })
  .strict();


  
export const SendMessageSchema = z
  .object({
    room_name: z.string(),
    message: z.string(),
  })
  .strict();


  export const AddRoomSchema = z
  .object({
    room_name: z.string(),
  })
  .strict();

