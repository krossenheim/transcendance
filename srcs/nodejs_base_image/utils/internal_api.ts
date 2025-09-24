import { ApiResponse } from './api/service/common/response';
import axios from 'axios';

class ContainerTarget {
	target: string;
	port: string;

	constructor(target: string, port: string) {
		this.target = target;
		this.port = port;
	}

	async post<T>(path: string, body: any): Promise<ApiResponse<T>> {
		return ApiResponse<T>(await axios.post<T>(`http://${this.target}:${this.port}/internal_api/${path}`, body));
	}

	async get<T>(path: string): Promise<ApiResponse<T>> {
		return ApiResponse<T>(await axios.get<T>(`http://${this.target}:${this.port}/internal_api/${path}`));
	}
}

class Containers {
	auth: ContainerTarget;
	db: ContainerTarget;

	constructor() {
		this.auth = new ContainerTarget('auth', process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || '3000');
		this.db = new ContainerTarget('db', process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || '3000');
	}
}

export default new Containers();