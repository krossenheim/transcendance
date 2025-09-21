const axios = require("axios");
const { containersNameToIp } = require("/appservice/container_names.cjs");

class ContainerTarget {
    constructor(ip, port) {
        this.ip = ip;
        this.port = port;
    }

    async post(endpoint, payload) {
        try {
            return await axios.post(
                `http://${this.ip}:${this.port}/internal_api${endpoint}`,
                payload,
                { validateStatus: () => true }
            );
        } catch (error) {
            return null;
        }
    }

    async get(endpoint) {
        try {
            return await axios.get(
                `http://${this.ip}:${this.port}/internal_api${endpoint}`,
                { validateStatus: () => true }
            );
        } catch (error) {
            return null;
        }
    }
}

class Containers {
    constructor() {
        this.database = new ContainerTarget(
            process.env.DATABASE_NAME,
            process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS
        );
        this.auth = new ContainerTarget(
            process.env.AUTH_NAME,
            process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS
        );
        this.game = new ContainerTarget(
            process.env.GAME_NAME,
            process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS
        );
        this.chat = new ContainerTarget(
            process.env.CHAT_NAME,
            process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS
        );
        this.hub = new ContainerTarget(
            process.env.HUB_NAME,
            process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS
        );
    }
}

module.exports = {
    containers: new Containers()
};