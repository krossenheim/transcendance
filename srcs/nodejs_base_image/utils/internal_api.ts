import { ErrorResponse, type ErrorResponseType } from './api/service/common/error.js';
import { type FullUserType, FullUser } from './api/service/db/user.js';
import { zodParse } from './api/service/common/zodUtils.js';
import axios, { Axios, type AxiosResponse } from 'axios';
import { Result } from './api/service/common/result.js';

class ContainerTarget {
	target: string;
	port: string;
	
	constructor(target: string, port: string) {
		this.target = target;
		this.port = port;
	}

	async post(path: string, body: any): Promise<AxiosResponse<any> | undefined> {
		try {
			return await axios.post(`http://${this.target}:${this.port}/internal_api${path}`, body, { validateStatus: () => true });
		} catch (error : any) {
			console.error("Error in internal API POST request:", error);
			return undefined;
		}
	}

	async get(path: string): Promise<AxiosResponse<any> | undefined> {
		try {
			return await axios.get(`http://${this.target}:${this.port}/internal_api${path}`, { validateStatus: () => true });
		} catch (error : any) {
			console.error("Error in internal API GET request:", error);
			return undefined;
		}
	}
}

class DatabaseTarget extends ContainerTarget {
	async fetchUserData(userId: number): Promise<Result<FullUserType, ErrorResponseType>> {
		const response = await this.get(`/users/fetch/${userId}`);
		if (response === undefined)
			return Result.Err({ message: 'Database service unreachable' });

		if (response.status === 200)
			return Result.Ok(FullUser.parse(response.data));

		return Result.Err(zodParse(ErrorResponse, response.data).unwrapOr({ message: 'Unknown error from database service' }));
	}
}

class Containers {
	auth: ContainerTarget;
	db: DatabaseTarget;

	constructor() {
		this.auth = new ContainerTarget('auth', process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || '3000');
		this.db = new DatabaseTarget('db', process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || '3000');
	}
}

export default new Containers();
