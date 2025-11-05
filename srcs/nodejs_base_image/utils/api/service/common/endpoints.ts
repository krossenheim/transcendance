import {
  AddRoomPayloadSchema,
  AddToRoomPayloadSchema,
  EmptySchema,
  RequestRoomByIdSchema,
  room_id_rule,
  room_name_rule,
  SendMessagePayloadSchema,
} from "../chat/chat_interfaces.js";
import {
  UserConnectionStatusSchema,
  RequestUpdateFriendship,
} from "../db/friendship.js";
import { VerifyTokenPayload, StoreTokenPayload } from "../db/token.js";
import {
  StoredMessageSchema,
  RoomEventSchema,
  ListRoomsSchema,
  FullRoomInfoSchema,
} from "../chat/db_models.js";
import { AuthResponse } from "../auth/loginResponse.js";
import { CreateUser } from "../auth/createUser.js";
import { Friend, FullUser, GetUser } from "../db/user.js";
import { LoginUser } from "../auth/loginUser.js";
import { SingleToken } from "../auth/tokenData.js";
import { ErrorResponse } from "./error.js";
import { RoomSchema } from "../chat/db_models.js";
import {
  ForwardToContainerSchema,
  PayloadHubToUsersSchema,
} from "../hub/hub_interfaces.js";
import { z } from "zod";
import { gameIdValue, idValue, userIdValue } from "./zodRules.js";
import { GenericAuthClientRequest } from "./clientRequest.js";
import { UserAuthenticationRequestSchema } from "../hub/hub_interfaces.js";
import {
  GameStateSchema,
  GetGameInfoSchema,
  MovePaddlePayloadScheme,
  PlayerDeclaresReadyForGame,
  PlayerReadyForGameSchema,
  StartNewPongGameSchema,
} from "../pong/pong_interfaces.js";

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

export type WSResponseType = {
  code: number;
  payload: z.ZodType;
};

export type WSSchemaType = {
  args: z.ZodType;
  args_wrapper: z.ZodType;
  output_wrapper: z.ZodType;
  output: Record<string, WSResponseType>;
};

export type WebSocketRouteDef = {
  funcId: string;
  container: "chat" | "pong" | "users" | "hub";
  schema: WSSchemaType;
};

// Type safety wrapper
export function defineRoutes<
  const TH extends Record<string, Record<string, HTTPRouteDef>>,
  const TW extends Record<string, Record<string, WebSocketRouteDef>>
>(routes: { http: TH; ws: TW }): { readonly http: TH; readonly ws: TW } {
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
    users: {
      test: {
        funcId: "test",
        container: "users",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: EmptySchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            Success: {
              code: 0,
              payload: z.string(),
            },
            Failure: {
              code: 1,
              payload: ErrorResponse,
            },
          },
        },
      },

      requestFriendship: {
        funcId: "request_friendship",
        container: "users",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: RequestUpdateFriendship,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            ConnectionUpdated: {
              code: 0,
              payload: z.null(),
            },
            UserDoesNotExist: {
              code: 1,
              payload: ErrorResponse,
            },
            InvalidStatusRequest: {
              code: 3,
              payload: ErrorResponse,
            },
          },
        },
      },

      confirmFriendship: {
        funcId: "confirm_friendship",
        container: "users",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: RequestUpdateFriendship,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            ConnectionUpdated: {
              code: 0,
              payload: z.null(),
            },
            UserDoesNotExist: {
              code: 1,
              payload: ErrorResponse,
            },
            InvalidStatusRequest: {
              code: 3,
              payload: ErrorResponse,
            },
          },
        },
      },

      fetchUserConnections: {
        funcId: "fetch_user_connections",
        container: "users",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: z.null(),
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            Success: {
              code: 0,
              payload: z.array(Friend),
            },
            Failure: {
              code: 1,
              payload: ErrorResponse,
            },
          },
        },
      },
    },

    pong: {
      getGameState: {
        funcId: "get_game_state",
        container: "pong",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: EmptySchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            GameUpdate: {
              code: 0,
              payload: GameStateSchema,
            },
            NotInRoom: {
              code: 1,
              payload: ErrorResponse,
            },
            InvalidInput: {
              code: 2,
              payload: ErrorResponse,
            },
          },
        },
      },
      movePaddle: {
        funcId: "move_paddle",
        container: "pong",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: MovePaddlePayloadScheme,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            MessageSent: {
              code: 0,
              payload: EmptySchema,
            },
            NotInRoom: {
              code: 1,
              payload: ErrorResponse,
            },
            InvalidInput: {
              code: 2,
              payload: ErrorResponse,
            },
            NoSuchPaddle: {
              code: 3,
              payload: ErrorResponse,
            },
            NotYourPaddle: {
              code: 4,
              payload: ErrorResponse,
            },
          },
        },
      },
      startGame: {
        funcId: "start_game",
        container: "pong",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: StartNewPongGameSchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            GameInstanceCreated: {
              code: 0,
              payload: GetGameInfoSchema,
            },
            FailedCreateGame: {
              code: 1,
              payload: ErrorResponse,
            },
            InvalidInput: {
              code: 2,
              payload: ErrorResponse,
            },
          },
        },
      },

      userReportsReady: {
        funcId: "report_ready_for_pong_game",
        container: "pong",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: PlayerDeclaresReadyForGame,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            UserIsReady: {
              code: 0,
              payload: PlayerReadyForGameSchema,
            },
            GameHasStarted: {
              code: 1,
              payload: EmptySchema,
            },
            FailedToReady: {
              code: 2,
              payload: ErrorResponse,
            },
            AlreadyReady: {
              code: 3,
              payload: ErrorResponse,
            },
          },
        },
      },
    },
    chat: {
      sendMessage: {
        funcId: "/api/chat/send_message_to_room",
        container: "chat", // yes, the object parent of the (sendMessage) holding this is named chat.
        //                    but i'd rather type it twice
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: SendMessagePayloadSchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            MessageSent: {
              code: 0,
              payload: StoredMessageSchema,
            },
            NotInRoom: {
              code: 1,
              payload: ErrorResponse,
            },
            MessageTooShort: {
              code: 2,
              payload: ErrorResponse,
            },
            InvalidInput: {
              code: 3,
              payload: ErrorResponse,
            },
            InvitationNotAccepted: {
              code: 4,
              payload: ErrorResponse,
            },
          },
        },
      },
      addUserToRoom: {
        funcId: "/api/chat/add_user_to_room",
        container: "chat",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: AddToRoomPayloadSchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            UserAdded: {
              code: 0,
              payload: RoomEventSchema,
            },
            NotInRoom: {
              code: 1,
              payload: ErrorResponse,
            },
            InvalidInput: {
              code: 2,
              payload: ErrorResponse,
            },
            AlreadyInRoom: {
              code: 3,
              payload: ErrorResponse,
            },
            NoSuchRoom: {
              code: 4,
              payload: ErrorResponse,
            },
          },
        },
      },
      addRoom: {
        funcId: "/api/chat/add_a_new_room",
        container: "chat",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: AddRoomPayloadSchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            AddedRoom: {
              code: 0,
              payload: RoomSchema,
            },
            FailedToAddRoom: {
              code: 1,
              payload: ErrorResponse,
            },
          },
        },
      },
      listRooms: {
        funcId: "/api/chat/list_rooms",
        container: "chat",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: EmptySchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            FullListGiven: {
              code: 0,
              payload: ListRoomsSchema,
            },
            NoListGiven: {
              code: 1,
              payload: ErrorResponse,
            },
          },
        },
      },
      getMessages: {
        funcId: "/api/chat/get_messages",
        container: "chat",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: z
            .object({
              roomId: room_id_rule,
            })
            .strict(),
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            FullRoomInfoGiven: {
              code: 0,
              payload: FullRoomInfoSchema,
            },
            NoListGiven: {
              code: 1,
              payload: ErrorResponse,
            },
          },
        },
      },
      joinRoom: {
        funcId: "/api/chat/join_room",
        container: "chat",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: RequestRoomByIdSchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            RoomJoined: {
              code: 0,
              payload: RoomEventSchema,
            },
            NoSuchRoom: {
              code: 1,
              payload: ErrorResponse,
            },
          },
        },
        code: {
          Joined: 0,
          NoSuchRoom: 1,
          AlreadyInRoom: 2,
        },
      },
    },
  },
});

/// /internal_api/*
export const int_url = defineRoutes({
  ws: {
    hub: {
      userConnected: {
        funcId: "user_connected",
        container: "hub", // Suspicious activity
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: EmptySchema, // not really meant to ever be called
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            Success: {
              code: 0,
              payload: GetUser,
            },
            Failure: {
              code: 1,
              payload: ErrorResponse,
            },
          },
        },
      },
      userDisconnected: {
        funcId: "user_disconnected",
        container: "hub", // Suspicious activity
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: EmptySchema, // not really meant to ever be called
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            Success: {
              code: 0,
              payload: GetUser,
            },
            Failure: {
              code: 1,
              payload: ErrorResponse,
            },
          },
        },
      },
      getOnlineUsers: {
        funcId: "get_online_users",
        container: "hub",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: EmptySchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            Success: {
              code: 0,
              payload: z.array(FullUser),
            },
            Failure: {
              code: 1,
              payload: ErrorResponse,
            },
          },
        },
      },
    },
  },
  http: {
    pong: {
      startGame: {
        endpoint: "/internal_api/pong/start_game_http",
        method: "POST",
        schema: {
          body: StartNewPongGameSchema,
          response: {
            200: GameStateSchema,
            401: ErrorResponse,
            404: ErrorResponse,
            500: ErrorResponse,
          },
        },
      },
    },
    db: {
      // Userdata endpoints
      fetchMultipleUsers: {
        // DEBUG ONLY
        endpoint: "/internal_api/db/users",
        method: "POST",
        schema: {
          body: z.array(userIdValue),
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

      updateUserConnectionStatus: {
        endpoint: "/internal_api/db/users/update_connection_status",
        method: "POST",
        schema: {
          body: z.array(UserConnectionStatusSchema),
          response: {
            200: z.null(), // Updated successfully
            400: ErrorResponse, // Invalid status transition
            500: ErrorResponse, // Internal server error
          },
        },
      },

      fetchUserConnections: {
        endpoint: "/internal_api/db/users/get_user_connections/:userId",
        method: "GET",
        schema: {
          params: GetUser,
          response: {
            200: z.array(Friend), // Retrieved friendlist
            500: ErrorResponse, // Internal server error
          },
        },
      },

      getUserConnections: {
        endpoint: "/internal_api/db/users/connections/:userId",
        method: "GET",
        schema: {
          params: GetUser,
          response: {
            200: z.array(UserConnectionStatusSchema), // Retrieved contacts
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
});
