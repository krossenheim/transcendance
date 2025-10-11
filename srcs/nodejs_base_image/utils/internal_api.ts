import axios, { Axios, type AxiosResponse } from "axios";

class ContainerTarget {
  target: string;
  port: string;

  constructor(target: string, port: string) {
    this.target = target;
    this.port = port;
  }

  async post(path: string, body: any): Promise<AxiosResponse<any> | undefined> {
    try {
      return await axios.post(
        `http://${this.target}:${this.port}/internal_api${path}`,
        body,
        { validateStatus: () => true }
      );
    } catch (error: any) {
      console.error(
        "Error in internal API POST request url was " +
          `http://${this.target}:${this.port}/internal_api${path}`,
        "error was:\n",
        error
      );
      return undefined;
    }
  }

  async get(path: string): Promise<AxiosResponse<any> | undefined> {
    try {
      return await axios.get(
        `http://${this.target}:${this.port}/internal_api${path}`,
        { validateStatus: () => true }
      );
    } catch (error: any) {
      console.error("Error in internal API GET request:", error);
      return undefined;
    }
  }
}

class Containers {
  auth: ContainerTarget;
  db: ContainerTarget;

  constructor() {
    this.auth = new ContainerTarget(
      "auth",
      process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000"
    );
    this.db = new ContainerTarget(
      "db",
      process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000"
    );
  }
}

export default new Containers();
