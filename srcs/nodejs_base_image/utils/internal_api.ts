import { ErrorResponse, type ErrorResponseType } from './api/service/common/error.js';
import { type FullUserType, FullUser } from './api/service/db/user.js';
import { zodParse } from './api/service/common/zodUtils.js';
import axios, { Axios, type AxiosResponse } from 'axios';
import { Result } from './api/service/common/result.js';
import type { Data } from 'ws';

class ContainerTarget {
  target: string;
  port: string;

  constructor(target: string, port: string) {
    this.target = target;
    this.port = port;
  }

	async post(path: string, body: any): Promise<Result<AxiosResponse<any>, string>> {
		try {
			return Result.Ok(await axios.post(`http://${this.target}:${this.port}${path}`, body, { validateStatus: () => true }));
		} catch (error : any) {
			console.error(
        "Error in internal API POST request url was " +
          `http://${this.target}:${this.port}${path}`,
        "error was:\n",
        error
      );
			return Result.Err("Failed to fetch data");
		}
	}

	async get(path: string): Promise<Result<AxiosResponse<any>, string>> {
		try {
			return Result.Ok(await axios.get(`http://${this.target}:${this.port}${path}`, { validateStatus: () => true }));
		} catch (error : any) {
			console.error(
        "Error in internal API GET request url was " +
          `http://${this.target}:${this.port}${path}`,
        "error was:\n",
        error
      );
			return Result.Err("Failed to fetch data");
		}
	}
}

class DatabaseTarget extends ContainerTarget {
	async fetchUserData(userId: number): Promise<Result<FullUserType, ErrorResponseType>> {
		const responseResult = await this.get(`/users/fetch/${userId}`);
		if (responseResult.isErr())
			return Result.Err({ message: 'Database service unreachable' });

		const response = responseResult.unwrap();
		if (response.status === 200)
			return zodParse(FullUser, response.data).mapErr((err) => ({ message: err }));

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
