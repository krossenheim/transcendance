const { containerNames } = require('/appservice/_container_names.cjs')

/**
 * Resolve a container name to an IP and check if it is reachable on a port.
 * @param {string} containerName - The Docker service/container name
 * @param {number} port - Port to test connectivity
 */

if ( process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS == undefined)
{
      throw new Error("Env var COMMON_PORT_ALL_DOCKER_CONTAINERS not set'" + cname + "'.");
}

if ( process.env.CHATROOM_IPV4_ADDRESS == undefined)
{
      throw new Error("Env var CHATROOM_IPV4_ADDRESS not set'" + cname + "'.");
}

if ( process.env.NGINX_IPV4_ADDRESS == undefined)
{
      throw new Error("Env var NGINX_IPV4_ADDRESS not set'" + cname + "'.");
}

if ( process.env.DATABASE_IPV4_ADDRESS == undefined)
{
      throw new Error("Env var DATABASE_IPV4_ADDRESS not set'" + cname + "'.");
}

if ( process.env.AUTH_IPV4_ADDRESS == undefined)
{
      throw new Error("Env var AUTH_IPV4_ADDRESS not set'" + cname + "'.");
}

if ( process.env.HUB_IPV4_ADDRESS == undefined)
{
      throw new Error("Env var HUB_IPV4_ADDRESS not set'" + cname + "'.");
}

const containersIpToNames = new Map();
containersIpToNames.set(process.env.NGINX_IPV4_ADDRESS, "nginx");
containersIpToNames.set(process.env.CHATROOM_IPV4_ADDRESS, "chatroom_hub");
containersIpToNames.set(process.env.DATABASE_IPV4_ADDRESS, "database_service");
containersIpToNames.set(process.env.AUTH_IPV4_ADDRESS, "auth_service");
containersIpToNames.set(process.env.HUB_IPV4_ADDRESS, "backend_hub");

module.exports = { containerNames, containersIpToNames };