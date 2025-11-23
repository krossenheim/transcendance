import { UserAuthenticationRequestSchema } from "./utils/api/service/hub/hub_interfaces.js";
import { ErrorResponse } from "./utils/api/service/common/error.js";
import { pub_url } from "./utils/api/service/common/endpoints.js";
import { JSONtoZod } from "./utils/api/service/common/json.js";
import { Result } from "./utils/api/service/common/result.js";
import { z } from "zod";

import containers from "./utils/internal_api.js";

import type { FastifyRequest } from "fastify";

async function validateJWTToken(
  token: string
): Promise<Result<number, string>> {
  const responseResult = await containers.auth.post(
    pub_url.http.auth.validateToken,
    { token: token }
  );

  if (responseResult.isErr())
    return Result.Err(responseResult.unwrapErr());

  const response = responseResult.unwrap();
  if (response.status === 200) {
    const userId = z.number().safeParse(response.data);
    if (!userId.success)
      return Result.Err("Auth service returned invalid data");
    return Result.Ok(userId.data);
  }

  const errorData = ErrorResponse.safeParse(response.data);
  if (!errorData.success) {
    console.error(
      "Unexpected response from auth service:",
      response.status,
      response.data
    );
    return Result.Err("Error validating token");
  } else
    return Result.Err(errorData.data.message);
}

export async function isRequestAuthenticated(
  req: FastifyRequest
): Promise<Result<number, string>> {
  const auth = req.headers.authorization;
  const jwtToken = auth && auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!jwtToken)
    return Result.Err("Missing or invalid Authorization header");

  return await validateJWTToken(jwtToken);
}

export async function isWSAuthenticated(parsed: any): Promise<Result<number, string>> {
  console.log("Authenticating WS request:", parsed);
  const userAuthAttempt = JSONtoZod(parsed, UserAuthenticationRequestSchema);
  if (userAuthAttempt.isErr()) {
    console.error("Invalid authentication request format:", userAuthAttempt.unwrapErr());
    return Result.Err("Invalid authentication request.");
  }

  const token = userAuthAttempt.unwrap().authorization;
  return await validateJWTToken(token);
}

export default {
    isRequestAuthenticated,
    isWSAuthenticated,
};