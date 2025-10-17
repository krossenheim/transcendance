import {
  AddRoomPayloadSchema,
  SendMessagePayloadSchema,
} from "../chat/chat_interfaces.js";
import {
  UpdateFriendshipStatusSchema,
  RequestUpdateFriendship,
} from "../db/friendship.js";
import { VerifyTokenPayload, StoreTokenPayload } from "../db/token.js";
import { StoredMessageSchema } from "../chat/db_models.js";
import { AuthResponse } from "../auth/loginResponse.js";
import { CreateUser } from "../auth/createUser.js";
import { FullUser, GetUser } from "../db/user.js";
import { LoginUser } from "../auth/loginUser.js";
import { SingleToken } from "../auth/tokenData.js";
import { ErrorResponse } from "./error.js";
import { RoomSchema } from "../chat/db_models.js";
import { ForwardToContainerSchema } from "../hub/hub_interfaces.js";
import { z } from "zod";
import { userIdValue } from "./zodRules.js";
import { GenericAuthClientRequest } from "./clientRequest.js";
import { UserAuthenticationRequestSchema } from "../hub/hub_interfaces.js";

export type HTTPRouteDef = {
  endpoint: string;
  wrapper?: z.ZodObject<{ payload: z.ZodTypeAny }>;
  method: "POST" | "GET" | "PUT" | "DELETE";
  schema: {
    body?: z.ZodType;
    query?: any;
    params?: any;
    response: Record<number, z.ZodType | null>;
  };
};

// TODO
export type WebSocketRouteDef = {
  funcId: string;
  container: "chat" | "pong" | "user";
  schema: {
    body: z.ZodType;
    wrapper: z.ZodType;
    response: Record<number, z.ZodType>;
  };
  code: Record<string, number>;
};

// Type safety wrapper
export function defineRoutes<
  TH extends Record<string, Record<string, HTTPRouteDef>> = never,
  TW extends Record<string, Record<string, WebSocketRouteDef>> = never
>(routes: { http: TH; ws: TW }) {
  return routes;
}

/// /public_api/*
export const pub_url = defineRoutes({
  http: {
    auth: {
      validateToken: {
        endpoint: "/public_api/auth/validate_token",
        method: "POST",
        schema: {
          body: SingleToken,
          response: {
            200: userIdValue, // Token valid - return user ID
            401: ErrorResponse, // Token invalid
            500: ErrorResponse, // Internal server error
          },
        },
      },

      refreshToken: {
        endpoint: "/public_api/auth/refresh",
        method: "POST",
        schema: {
          body: SingleToken,
          response: {
            200: AuthResponse,
            401: ErrorResponse,
            500: ErrorResponse,
          },
        },
      },

      loginUser: {
        endpoint: "/public_api/auth/login",
        method: "POST",
        schema: {
          body: LoginUser,
          response: {
            200: AuthResponse, // Login successful
            401: ErrorResponse, // Username/Password don't match / don't exist
            500: ErrorResponse, // Internal server error
          },
        },
      },

      createNormalUser: {
        endpoint: "/public_api/auth/create/user",
        method: "POST",
        schema: {
          body: CreateUser,
          response: {
            201: AuthResponse, // Created user
            400: ErrorResponse, // Missing fields / User already exists
            500: ErrorResponse, // Internal server error
          },
        },
      },

      createGuestUser: {
        endpoint: "/public_api/auth/create/guest",
        method: "GET",
        schema: {
          response: {
            201: AuthResponse,
            500: ErrorResponse,
          },
        },
      },
    },
  },

  ws: {},
});

//  sendMessage would be assigned:
// not refreshToken: "/public_api/auth/refresh",
// but refreshToken: { some object. contains ""/public_api/auth/refresh""},

export const user_url = defineRoutes({
  http: {
    users: {
      fetchUser: {
        endpoint: "/api/users/fetch",
        wrapper: GenericAuthClientRequest,
        method: "POST",
        schema: {
          body: userIdValue,
          response: {
            200: z.array(FullUser),
            401: ErrorResponse,
            404: ErrorResponse,
            500: ErrorResponse,
          },
        },
      },

      requestFriendship: {
        endpoint: "/api/users/request_friendship",
        wrapper: GenericAuthClientRequest,
        method: "POST",
        schema: {
          body: RequestUpdateFriendship,
          response: {
            200: z.null(),
            401: ErrorResponse,
            500: ErrorResponse,
          },
        },
      },
    },
  },

  ws: {
    chat: {
      sendMessage: {
        funcId: "/api/chat/send_message_to_room",
        container: "chat",
        schema: {
          wrapper: ForwardToContainerSchema,
          body: SendMessagePayloadSchema,
          response: {
            0: StoredMessageSchema,
            1: ErrorResponse,
            2: ErrorResponse,
          },
        },
        code: {
          MessageSent: 0,
          NotInRoom: 1,
          InvalidInput: 2,
        },
      },
      addRoom: {
        funcId: "/api/chat/add_a_new_room",
        container: "chat",
        schema: {
          wrapper: ForwardToContainerSchema,
          body: AddRoomPayloadSchema,
          response: {
            0: RoomSchema,
            1: ErrorResponse,
          },
        },
        code: {
          RoomMade: 0,
          RoomNotMade: 1,
        },
      },
    },
  },
});

/// /internal_api/*
export const int_url = defineRoutes({
  http: {
    db: {
      // Userdata endpoints
      listUsers: {
        // DEBUG ONLY
        endpoint: "/internal_api/db/users",
        method: "GET",
        schema: {
          response: {
            200: z.array(FullUser),
            500: ErrorResponse,
          },
        },
      },

      getUser: {
        endpoint: "/internal_api/db/users/fetch/:userId",
        method: "GET",
        schema: {
          params: GetUser,
          response: {
            200: FullUser, // Found user
            404: ErrorResponse, // User not found
          },
        },
      },

      createNormalUser: {
        endpoint: "/internal_api/db/users/create/normal",
        method: "POST",
        schema: {
          body: CreateUser,
          response: {
            201: FullUser, // Created user
            400: ErrorResponse, // User already exists / Invalid data
          },
        },
      },

      createGuestUser: {
        endpoint: "/internal_api/db/users/create/guest",
        method: "GET",
        schema: {
          response: {
            201: FullUser, // Created guest user
            500: ErrorResponse, // Internal server error
          },
        },
      },

      getUserPfp: {
        endpoint: "/internal_api/db/users/pfp/:userId",
        method: "GET",
        schema: {
          params: GetUser,
          response: {
            200: z.string(), // Found avatar
            404: ErrorResponse, // Avatar not found
          },
        },
      },

      loginUser: {
        endpoint: "/internal_api/db/users/login",
        method: "POST",
        schema: {
          body: LoginUser,
          response: {
            200: FullUser, // Successful login; return user data
            401: ErrorResponse, // Invalid username or password
            500: ErrorResponse, // Internal server error
          },
        },
      },

      updateUserFriendshipStatus: {
        endpoint: "/internal_api/db/users/update_friendship_status",
        method: "POST",
        schema: {
          body: UpdateFriendshipStatusSchema,
          response: {
            200: z.null(), // Updated successfully
            400: ErrorResponse, // Invalid status transition
            500: ErrorResponse, // Internal server error
          },
        },
      },

      // Tokendata endpoints
      validateToken: {
        endpoint: "/internal_api/db/users/validate_token",
        method: "POST",
        schema: {
          body: VerifyTokenPayload,
          response: {
            200: FullUser, // Valid token; return user data
            401: ErrorResponse, // Invalid token; or token not found
            500: ErrorResponse, // Internal server error
          },
        },
      },

      storeToken: {
        endpoint: "/internal_api/db/users/store_token",
        method: "POST",
        schema: {
          body: StoreTokenPayload,
          response: {
            200: z.null(), // Token was stored successfully
            500: ErrorResponse, // Internal server error
          },
        },
      },

      // Chatdata endpoints
      createChatRoom: {
        endpoint: "/internal_api/chat/rooms/create",
        method: "POST",
        schema: {
          body: AddRoomPayloadSchema,
          response: {
            201: RoomSchema, // Created room
            500: ErrorResponse, // Internal server error
          },
        },
      },

      getRoomMessages: {
        endpoint: "/internal_api/chat/rooms/get_messages",
        method: "POST",
        schema: {
          body: VerifyTokenPayload,
          response: {
            200: StoredMessageSchema, // Messages retrieved successfully
            401: ErrorResponse, // Token invalid
            500: ErrorResponse, // Internal server error
          },
        },
      },
    },
  },

  ws: {},
});
