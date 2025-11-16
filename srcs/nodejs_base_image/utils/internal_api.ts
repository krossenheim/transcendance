import { ErrorResponse, type ErrorResponseType } from './api/service/common/error.js';
import { type FullUserType, FullUser } from './api/service/db/user.js';
import { int_url, type HTTPRouteDef } from './api/service/common/endpoints.js';
import { zodParse } from './api/service/common/zodUtils.js';
import axios, { Axios, type AxiosResponse } from 'axios';
import { Result } from './api/service/common/result.js';
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

  async post(targetAPI: HTTPRouteDef & { method: 'POST' }, body: any, params?: Record<string, string | number | boolean>, query?: Record<string, string>): Promise<Result<AxiosResponse<any>, string>> {
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

  async get(targetAPI: HTTPRouteDef & { method: 'GET' }, params?: Record<string, string | number | boolean>, query?: Record<string, string>): Promise<Result<AxiosResponse<any>, string>> {
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
  async fetchUserData(userId: number): Promise<Result<FullUserType, ErrorResponseType>> {
    const responseResult = await this.get(int_url.http.db.getUser, { userId });
    if (responseResult.isErr())
      return Result.Err({ message: 'Database service unreachable' });

    const response = responseResult.unwrap();
    if (response.status === 200)
      return zodParse(FullUser, response.data).mapErr((err) => ({ message: err }));

    return Result.Err(zodParse(ErrorResponse, response.data).unwrapOr({ message: 'Unknown error from database service' }));
  }

  async fetchUserByUsername(username: string): Promise<Result<FullUserType, ErrorResponseType>> {
    const responseResult = await this.get(int_url.http.db.searchUserByUsername, { username });
    if (responseResult.isErr())
      return Result.Err({ message: 'Database service unreachable' });

    const response = responseResult.unwrap();
    if (response.status === 200)
      return zodParse(FullUser, response.data).mapErr((err) => ({ message: err }));

    return Result.Err(zodParse(ErrorResponse, response.data).unwrapOr({ message: 'Unknown error from database service' }));
  }

  async fetchMultipleUsers(userIds: number[]): Promise<Result<FullUserType[], ErrorResponseType>> {
    const responseResult = await this.post(int_url.http.db.fetchMultipleUsers, userIds);
    if (responseResult.isErr())
      return Result.Err({ message: 'Database service unreachable' });

    const response = responseResult.unwrap();
    if (response.status === 200)
      return zodParse(z.array(FullUser), response.data).mapErr((err) => ({ message: err }));

    return Result.Err(zodParse(ErrorResponse, response.data).unwrapOr({ message: 'Unknown error from database service' }));
  }
}

class Containers {
  auth: ContainerTarget;
  db: DatabaseTarget;

  constructor() {
    this.auth = new ContainerTarget(
      "auth",
      process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000"
    );
    this.db = new DatabaseTarget(
      "db",
      process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000"
    );
  }
}

export default new Containers();
