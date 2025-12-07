import {
  AddRoomPayloadSchema,
  AddToRoomPayloadSchema,
  EmptySchema,
  RequestRoomByIdSchema,
  SendDMMessagePayloadSchema,
  SendMessagePayloadSchema,
} from "@app/shared/api/service/chat/chat_interfaces";
import { UserConnectionStatusSchema } from "@app/shared/api/service/db/friendship";
import { VerifyTokenPayload, StoreTokenPayload } from "@app/shared/api/service/db/token";
import {
  StoredMessageSchema,
  RoomEventSchema,
  ListRoomsSchema,
  FullRoomInfoSchema,
  DMCreatedResponseSchema,
  RoomSchema,
} from "@app/shared/api/service/chat/db_models";
import { AuthResponse } from "@app/shared/api/service/auth/loginResponse";
import { CreateUser } from "@app/shared/api/service/auth/createUser";
import { Friend, FullUser, GetUser, PublicUserData, UpdateUserData } from "@app/shared/api/service/db/user";
import { TwoFactorRequiredResponse } from "@app/shared/api/service/auth/twoFactorRequired";
import { LoginUser } from "@app/shared/api/service/auth/loginUser";
import { SingleToken } from "@app/shared/api/service/auth/tokenData";
import { ErrorResponse } from "@app/shared/api/service/common/error";
import {
  ForwardToContainerSchema,
  PayloadHubToUsersSchema,
} from "@app/shared/api/service/hub/hub_interfaces";
import { z } from "zod";
import { gameIdValue, idValue, userIdValue } from "@app/shared/api/service/common/zodRules";
import { GenericAuthClientRequest } from "@app/shared/api/service/common/clientRequest";
import {
  GameStateSchema,
  GetGameInfoSchema,
  MovePaddlePayloadScheme,
  PlayerDeclaresReadyForGame,
  PlayerReadyForGameSchema,
  StartNewPongGameSchema,
  CreateLobbySchema,
  LobbyDataSchema,
  TournamentDataSchema,
  SetPlayerAliasSchema,
  JoinTournamentMatchSchema,
} from "@app/shared/api/service/pong/pong_interfaces";
import { GameResult } from "@app/shared/api/service/db/gameResult";

export const defaultResponses: Record<number, z.ZodType | null> = {
  400: ErrorResponse,
  401: ErrorResponse,
  500: ErrorResponse,
} as const;

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
            200: z.union([AuthResponse, TwoFactorRequiredResponse]), // Login successful or 2FA required
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

      // 2FA endpoints
      setup2FA: {
        endpoint: "/public_api/auth/2fa/setup",
        method: "POST",
        schema: {
          body: z.object({
            userId: userIdValue,
            username: z.string(),
          }),
          response: {
            200: z.object({
              qrCode: z.string(),
              secret: z.string(),
              uri: z.string(),
            }),
            500: ErrorResponse,
          },
        },
      },

      enable2FA: {
        endpoint: "/public_api/auth/2fa/enable",
        method: "POST",
        schema: {
          body: z.object({
            userId: userIdValue,
            code: z.string(),
          }),
          response: {
            200: z.object({ message: z.string() }),
            400: ErrorResponse,
            500: ErrorResponse,
          },
        },
      },

      disable2FA: {
        endpoint: "/public_api/auth/2fa/disable",
        method: "POST",
        schema: {
          body: z.object({
            userId: userIdValue,
          }),
          response: {
            200: z.object({ message: z.string() }),
            500: ErrorResponse,
          },
        },
      },

      verify2FALogin: {
        endpoint: "/public_api/auth/2fa/verify-login",
        method: "POST",
        schema: {
          body: z.object({
            tempToken: z.string(),
            code: z.string(),
          }),
          response: {
            200: AuthResponse,
            401: ErrorResponse,
            500: ErrorResponse,
          },
        },
      },

      check2FAStatus: {
        endpoint: "/public_api/auth/2fa/status/:userId",
        method: "GET",
        schema: {
          params: z.object({ userId: userIdValue }),
          response: {
            200: z.object({ enabled: z.boolean() }),
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
      fetchUserAvatar: {
        endpoint: "/api/users/pfp",
        wrapper: GenericAuthClientRequest,
        method: "POST",
        schema: {
          body: z.object({ file: z.string() }),
          response: {
            200: z.any(), // Image buffer
            500: ErrorResponse,
          },
        },
      },
    },

    auth: {
      logoutUser: {
        endpoint: "/api/auth/logout",
        wrapper: GenericAuthClientRequest,
        method: "POST",
        schema: {
          body: z.null(),
          response: {
            200: z.null(),
            500: ErrorResponse,
          },
        },
      },
    }
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

      userOnlineStatusUpdate: {
        funcId: "user_online_status_update",
        container: "users",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: z.null(),
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            GetOnlineUsers: {
              code: 0,
              payload: z.array(userIdValue),
            },
            GetOfflineUsers: {
              code: 1,
              payload: z.array(userIdValue),
            },
            Failure: {
              code: 2,
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
          args: userIdValue,
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
          args: userIdValue,
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

      denyFriendship: {
        funcId: "deny_friendship",
        container: "users",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: userIdValue,
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
            NoPendingRequest: {
              code: 2,
              payload: ErrorResponse,
            },
            FailedToUpdate: {
              code: 3,
              payload: ErrorResponse,
            },
          },
        },
      },

      removeFriendship: {
        funcId: "remove_friendship",
        container: "users",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: userIdValue,
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
            NotFriends: {
              code: 2,
              payload: ErrorResponse,
            },
            FailedToUpdate: {
              code: 3,
              payload: ErrorResponse,
            },
          },
        },
      },

      blockUser: {
        funcId: "block_user",
        container: "users",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: userIdValue,
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

      unblockUser: {
        funcId: "unblock_user",
        container: "users",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: userIdValue,
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
      fetchUserGameResults: {
        funcId: "fetch_user_game_results",
        container: "users",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: userIdValue,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            Success: {
              code: 0,
              payload: z.array(GameResult),
            },
            Failure: {
              code: 1,
              payload: ErrorResponse,
            },
          },
        },
      },

      requestUserProfileData: {
        funcId: "user_profile",
        container: "users",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: z.union([userIdValue, z.string()]),
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            Success: {
              code: 0,
              payload: PublicUserData,
            },
            UserDoesNotExist: {
              code: 1,
              payload: ErrorResponse,
            },
          },
        },
      },

      updateProfile: {
        funcId: "update_profile",
        container: "users",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: UpdateUserData,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            ProfileUpdated: { 
              code: 0, 
              payload: FullUser,
            },
            FailedToUpdate: {
              code: 1,
              payload: ErrorResponse
            },
          },
        },
      },
    },  // <-- CLOSE users HERE

    pong: {  // <-- pong should be at the same level as users
      getGameState: {
        funcId: "get_game_state",
        container: "pong",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: z.object({ gameId: gameIdValue }),
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            GameUpdate: {
              code: 0,
              payload: z.any(),
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

      createLobby: {
        funcId: "create_pong_lobby",
        container: "pong",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: CreateLobbySchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            LobbyCreated: {
              code: 0,
              payload: LobbyDataSchema,
            },
            InvalidInput: {
              code: 1,
              payload: ErrorResponse,
            },
            Failed: {
              code: 2,
              payload: ErrorResponse,
            },
          },
        },
      },

      togglePlayerReady: {
        funcId: "toggle_player_ready_in_lobby",
        container: "pong",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: z.object({ lobbyId: gameIdValue }),
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            LobbyUpdate: {
              code: 0,
              payload: LobbyDataSchema,
            },
            NotInLobby: {
              code: 1,
              payload: ErrorResponse,
            },
          },
        },
      },

      leaveLobby: {
        funcId: "leave_pong_lobby",
        container: "pong",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: z.object({ lobbyId: gameIdValue }),
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            LeftLobby: {
              code: 0,
              payload: z.object({ message: z.string() }),
            },
            LobbyUpdate: {
              code: 1,
              payload: LobbyDataSchema,
            },
            NotInLobby: {
              code: 2,
              payload: ErrorResponse,
            },
          },
        },
      },

      startFromLobby: {
        funcId: "start_game_from_lobby",
        container: "pong",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: z.object({ lobbyId: gameIdValue }),
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            GameStarted: {
              code: 0,
              payload: GameStateSchema,
            },
            NotAllReady: {
              code: 1,
              payload: ErrorResponse,
            },
            NotHost: {
              code: 2,
              payload: ErrorResponse,
            },
          },
        },
      },

      setTournamentAlias: {
        funcId: "set_tournament_alias",
        container: "pong",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: SetPlayerAliasSchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            AliasSet: {
              code: 0,
              payload: TournamentDataSchema,
            },
            InvalidAlias: {
              code: 1,
              payload: ErrorResponse,
            },
            NotInTournament: {
              code: 2,
              payload: ErrorResponse,
            },
          },
        },
      },

      joinTournamentMatch: {
        funcId: "join_tournament_match",
        container: "pong",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: JoinTournamentMatchSchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            MatchStarted: {
              code: 0,
              payload: GameStateSchema,
            },
            MatchNotReady: {
              code: 1,
              payload: ErrorResponse,
            },
            NotYourMatch: {
              code: 2,
              payload: ErrorResponse,
            },
          },
        },
      },
    },
    chat: {
      sendMessage: {
        funcId: "/api/chat/send_message_to_room",
        container: "chat",
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
            FailedToStoreMessage: {
              code: 5,
              payload: ErrorResponse,
            },
          },
        },
      },
      sendDirectMessage: {
        funcId: "/api/chat/send_direct_message",
        container: "chat",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: SendDMMessagePayloadSchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            MessageSent: {
              code: 0,
              payload: DMCreatedResponseSchema,
            },
            UserNotFound: {
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
            FailedToStoreMessage: {
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
            FailedToAddUser: {
              code: 5,
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
            FailedToJoinRoom: {
              code: 2,
              payload: ErrorResponse,
            }
          },
        },
        code: {
          Joined: 0,
          NoSuchRoom: 1,
          AlreadyInRoom: 2,
        },
      },
      getRoomData: {
        funcId: "/api/chat/get_room_data",
        container: "chat",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: RequestRoomByIdSchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            RoomDataProvided: {
              code: 0,
              payload: FullRoomInfoSchema,
            },
            NoSuchRoom: {
              code: 1,
              payload: ErrorResponse,
            },
          },
        },
      },
      userConnected: {
        funcId: "user_connected",
        container: "chat",
        schema: {
          args_wrapper: ForwardToContainerSchema,
          args: EmptySchema,
          output_wrapper: PayloadHubToUsersSchema,
          output: {
            UserConnected: {
              code: 0,
              payload: GetUser,
            },
          },
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
      createGame: {
        endpoint: "/internal_api/pong/create_game",
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

      searchUserByUsername: {
        endpoint: "/internal_api/db/users/search/:username",
        method: "GET",
        schema: {
          params: z.object({ username: z.string() }),
          response: {
            200: FullUser, // Found user
            404: ErrorResponse, // User not found
            500: ErrorResponse, // Internal server error
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
        endpoint: "/internal_api/db/users/pfp",
        method: "POST",
        schema: {
          body: z.object({ file: z.string() }),
          response: {
            200: z.any(), // Found avatar
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

      logoutUser: {
        endpoint: "/internal_api/db/tokens/logout",
        method: "POST",
        schema: {
          body: z.object({ userId: userIdValue }),
          response: {
            200: z.null(), // Logged out successfully
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

      fetchUserGameResults: {
        endpoint: "/internal_api/db/users/game_results/:userId",
        method: "GET",
        schema: {
          params: GetUser,
          response: {
            200: z.array(GameResult), // Retrieved game results
            404: ErrorResponse, // User not found
            500: ErrorResponse, // Internal server error
          },
        },
      },

      updateUserData: {
        endpoint: "/internal_api/db/users/update_profile",
        method: "POST",
        schema: {
          body: UpdateUserData.extend({ userId: userIdValue }),
          response: {
            200: FullUser, // Updated user profile
            400: ErrorResponse, // Invalid data
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
          body: AddRoomPayloadSchema.extend({ owner: userIdValue, personB: userIdValue.optional() }),
          response: {
            201: RoomSchema, // Created room
            500: ErrorResponse, // Internal server error
          },
        },
      },

      getRoomInfo: {
        endpoint: "/internal_api/chat/rooms/info/:roomId",
        method: "GET",
        schema: {
          params: RequestRoomByIdSchema,
          response: {
            200: FullRoomInfoSchema, // Retrieved room info
            404: ErrorResponse, // Room not found
            500: ErrorResponse, // Internal server error
          },
        },
      },

      fetchDMRoomInfo: {
        endpoint: "/internal_api/chat/rooms/dm_info/:userId1/:userId2",
        method: "GET",
        schema: {
          params: z.object({
            userId1: userIdValue,
            userId2: userIdValue,
          }),
          response: {
            200: z.object({
              room: FullRoomInfoSchema,
              created: z.boolean(),
            }),
            404: ErrorResponse, // DM room not found
            500: ErrorResponse, // Internal server error
          },
        },
      },

      sendMessage: {
        endpoint: "/internal_api/chat/rooms/send_message",
        method: "POST",
        schema: {
          body: SendMessagePayloadSchema.extend({ userId: idValue }),
          response: {
            200: StoredMessageSchema, // Message sent successfully
            400: ErrorResponse, // Invalid message data
            500: ErrorResponse, // Internal server error
          },
        },
      },

      getUserRooms: {
        endpoint: "/internal_api/chat/rooms/user_rooms/:userId",
        method: "GET",
        schema: {
          params: GetUser,
          response: {
            200: ListRoomsSchema, // Retrieved list of rooms
            500: ErrorResponse, // Internal server error
          },
        },
      },

      addUserToRoom: {
        endpoint: "/internal_api/chat/rooms/add_user",
        method: "POST",
        schema: {
          body: AddToRoomPayloadSchema.extend({ type: z.number() }),
          response: {
            200: z.null(), // User added successfully
            500: ErrorResponse, // Internal server error
          },
        },
      },

      check2FAStatus: {
        endpoint: "/internal_api/db/2fa/status/:userId",
        method: "GET",
        schema: {
          params: GetUser,
          response: {
            200: z.object({ enabled: z.boolean() }), // 2FA status
            500: ErrorResponse, // Internal server error
          },
        },
      },

      generate2FASecret: {
        endpoint: "/internal_api/db/2fa/generate",
        method: "POST",
        schema: {
          body: z.object({
            userId: userIdValue,
            username: z.string(),
          }),
          response: {
            200: z.object({
              qrCode: z.string(),
              secret: z.string(),
              uri: z.string(),
            }), // Generated QR code and secret
            403: ErrorResponse, // Guest users cannot enable 2FA
            500: ErrorResponse, // Internal server error
          },
        },
      },

      enable2FA: {
        endpoint: "/internal_api/db/2fa/enable",
        method: "POST",
        schema: {
          body: z.object({
            userId: userIdValue,
            code: z.string(),
          }),
          response: {
            200: z.object({ message: z.string() }), // 2FA enabled successfully
            400: ErrorResponse, // Invalid code
            403: ErrorResponse, // Guest users cannot enable 2FA
          },
        },
      },

      disable2FA: {
        endpoint: "/internal_api/db/2fa/disable",
        method: "POST",
        schema: {
          body: z.object({
            userId: userIdValue,
          }),
          response: {
            200: z.object({ message: z.string() }), // 2FA disabled successfully
            500: ErrorResponse, // Internal server error
          },
        },
      },

      verify2FACode: {
        endpoint: "/internal_api/db/2fa/verify",
        method: "POST",
        schema: {
          body: z.object({
            userId: userIdValue,
            code: z.string(),
          }),
          response: {
            200: z.object({ valid: z.boolean() }), // Code is valid
            400: ErrorResponse, // Invalid code or 2FA not enabled
            401: ErrorResponse, // Invalid code
          },
        },
      },

    },

    chat: {
      getUserConnections: {
        endpoint: "/internal_api/chat/users/connections/:userId",
        method: "GET",
        schema: {
          params: GetUser,
          response: {
            200: z.array(userIdValue), // Retrieved contacts
            500: ErrorResponse, // Internal server error
          },
        },
      },

      sendSystemMessage: {
        endpoint: "/internal_api/chat/rooms/send_system_message",
        method: "POST",
        schema: {
          body: SendMessagePayloadSchema,
          response: {
            200: z.null(), // System message sent successfully
            404: ErrorResponse, // Room not found
            500: ErrorResponse, // Internal server error
          },
        },
      }
    }
  },
});
