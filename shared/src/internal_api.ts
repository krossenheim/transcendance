import { ErrorResponse, type ErrorResponseType } from '@app/shared/api/service/common/error';
import { type FullUserType, FullUser } from '@app/shared/api/service/db/user';
import { int_url, type HTTPRouteDef } from '@app/shared/api/service/common/endpoints';
import { zodParse } from '@app/shared/api/service/common/zodUtils';
import axios, { type AxiosResponse } from 'axios';
import { Result } from '@app/shared/api/service/common/result';
import type { RouteBody, RouteQuery, RouteParams } from '@app/shared/api/service/common/fastify';
import { z } from 'zod';

class ContainerTarget {
  target: string;
  port: string;

  constructor(target: string, port: string) {
    this.target = target;
    this.port = port;
  }

  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean>, query?: Record<string, string>): string {
    const safeParams = params ?? {};
    const safeQuery = query ?? {};
    return `http://${this.target}:${this.port}${Object.keys(safeParams).reduce(
      (acc, key) => acc.replace(`:${key}`, encodeURIComponent(safeParams[key] || '')),
      endpoint
    )}${Object.keys(safeQuery).length > 0 ? `?${new URLSearchParams(safeQuery).toString()}` : ''}`;
  }

  async post<T extends HTTPRouteDef & { method: 'POST' }>(
    targetAPI: T,
    body: RouteBody<T>,
    params?: RouteParams<T>,
    query?: RouteQuery<T>
  ): Promise<Result<AxiosResponse<any>, string>> {
    try {
      return Result.Ok(await axios.post(this.buildUrl(targetAPI.endpoint, params, query), body, { validateStatus: () => true }));
    } catch (error: any) {
      console.error(
        "Error in internal API POST request url was " +
        this.buildUrl(targetAPI.endpoint, params, query),
        "error was:\n",
        error
      );
      return Result.Err("Failed to fetch data");
    }
  }

  async get<T extends HTTPRouteDef & { method: 'GET' }>(
    targetAPI: T,
    params?: RouteParams<T>,
    query?: RouteQuery<T>
  ): Promise<Result<AxiosResponse<any>, string>> {
    try {
      return Result.Ok(await axios.get(this.buildUrl(targetAPI.endpoint, params, query), { validateStatus: () => true }));
    } catch (error: any) {
      console.error(
        "Error in internal API GET request url was " +
        this.buildUrl(targetAPI.endpoint, params, query),
        "error was:\n",
        error
      );
      return Result.Err("Failed to fetch data");
    }
  }
}

class DatabaseTarget extends ContainerTarget {
  async fetchUserData(userId: number, allowSystem: boolean = false): Promise<Result<FullUserType, ErrorResponseType>> {
    const responseResult = await this.get(int_url.http.db.getUser, { userId });
    if (responseResult.isErr())
      return Result.Err({ message: 'Database service unreachable' });

    const response = responseResult.unwrap();
    if (response.status === 200) {
      if (allowSystem || response.data.accountType !== 0)
        return zodParse(FullUser, response.data).mapErr((err) => ({ message: err }));
      return Result.Err({ message: 'User is forbidden' });
    }

    return Result.Err(zodParse(ErrorResponse, response.data).unwrapOr({ message: 'Unknown error from database service' }));
  }

  async fetchUserByUsername(username: string, allowSystem: boolean = false): Promise<Result<FullUserType, ErrorResponseType>> {
    const responseResult = await this.get(int_url.http.db.searchUserByUsername, { username });
    if (responseResult.isErr())
      return Result.Err({ message: 'Database service unreachable' });

    const response = responseResult.unwrap();
    if (response.status === 200) {
      if (allowSystem || response.data.accountType !== 0)
        return zodParse(FullUser, response.data).mapErr((err) => ({ message: err }));
      return Result.Err({ message: 'User is forbidden' });
    }

    return Result.Err(zodParse(ErrorResponse, response.data).unwrapOr({ message: 'Unknown error from database service' }));
  }

  async fetchMultipleUsers(userIds: number[], allowSystem: boolean = false): Promise<Result<FullUserType[], ErrorResponseType>> {
    const responseResult = await this.post(int_url.http.db.fetchMultipleUsers, userIds);
    if (responseResult.isErr())
      return Result.Err({ message: 'Database service unreachable' });

    const response = responseResult.unwrap();
    if (response.status === 200)
      return zodParse(z.array(FullUser), response.data).map((users) => users.filter(user => allowSystem || user.accountType !== 0)).mapErr((err) => ({ message: err }));

    return Result.Err(zodParse(ErrorResponse, response.data).unwrapOr({ message: 'Unknown error from database service' }));
  }
}

class Containers {
  auth: ContainerTarget;
  db: DatabaseTarget;
  chat: ContainerTarget;

  constructor() {
    this.auth = new ContainerTarget(
      "auth",
      process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000"
    );
    this.db = new DatabaseTarget(
      "db",
      process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000"
    );
    this.chat = new ContainerTarget(
      "chat",
      process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000"
    );
  }
}

export default new Containers();
