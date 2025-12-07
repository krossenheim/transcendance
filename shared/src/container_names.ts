import run_bash_command from '@app/shared/run_bash_command';

if (!process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS)
{
      throw new Error("Env var COMMON_PORT_ALL_DOCKER_CONTAINERS not set'");
}

if (!process.env.CHATROOM_IPV4_ADDRESS)
{
      throw new Error("Env var CHATROOM_IPV4_ADDRESS not set'");
}

if (!process.env.NGINX_IPV4_ADDRESS)
{
      throw new Error("Env var NGINX_IPV4_ADDRESS not set'");
}

if (!process.env.DATABASE_IPV4_ADDRESS)
{
      throw new Error("Env var DATABASE_IPV4_ADDRESS not set'");
}

if (!process.env.AUTH_IPV4_ADDRESS)
{
      throw new Error("Env var AUTH_IPV4_ADDRESS not set'");
}

if (!process.env.HUB_IPV4_ADDRESS)
{
      throw new Error("Env var HUB_IPV4_ADDRESS not set'");
}

if (!process.env.PONG_IPV4_ADDRESS)
{
      throw new Error("Env var PONG_IPV4_ADDRESS not set'");
}

if (!process.env.USERS_IPV4_ADDRESS)
{
      throw new Error("Env var USERS_IPV4_ADDRESS not set'");
}

if (!process.env.LOBBY_IPV4_ADDRESS)
{
      throw new Error("Env var LOBBY_IPV4_ADDRESS not set'");
}

export const containersIpToName = new Map<string | undefined, string | undefined>();
export const containersNameToIp = new Map<string | undefined, string | undefined>();

// hardcoded names here

// containersIpToName.set(process.env.NGINX_IPV4_ADDRESS, process.env.NGINX_NAME);
containersIpToName.set(process.env.CHATROOM_IPV4_ADDRESS, process.env.CHATROOM_NAME);
containersIpToName.set(process.env.DATABASE_IPV4_ADDRESS, process.env.DATABASE_NAME);
containersIpToName.set(process.env.AUTH_IPV4_ADDRESS, process.env.AUTH_NAME);
containersIpToName.set(process.env.HUB_IPV4_ADDRESS, process.env.HUB_NAME);
containersIpToName.set(process.env.PONG_IPV4_ADDRESS, process.env.PONG_NAME);
containersIpToName.set(process.env.USERS_IPV4_ADDRESS, process.env.USERS_NAME);
containersIpToName.set(process.env.LOBBY_IPV4_ADDRESS, process.env.LOBBY_NAME);
// 

export const my_address = run_bash_command("getent hosts ${HOSTNAME} | awk '{print $1}'");
console.log("My address is: " + my_address);
if (!my_address)
{
    throw new Error("'getent hosts ${HOSTNAME} | awk '{print $1}' did not return any output.")
}

// Find executing container listed_address in the hand coded list of ips above.
// give myself the name listed above.
// Any container failing to do this should throw.

export const g_myContainerName = containersIpToName.get(my_address);

if (!g_myContainerName) {
  throw new Error(`Could not determine container name for IP: ${my_address}`);
}

export default {
  g_myContainerName,
  containersNameToIp,
  containersIpToName,
};
