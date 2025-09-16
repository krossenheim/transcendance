const { run_bash_command } = require('/appservice/run_bash_command.cjs');

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

const containersIpToName = new Map();
const containersNameToIp = new Map();

// hardcoded names here
containersIpToName.set(process.env.NGINX_IPV4_ADDRESS, "nginx");
containersIpToName.set(process.env.CHATROOM_IPV4_ADDRESS, "chatroom_hub");
containersIpToName.set(process.env.DATABASE_IPV4_ADDRESS, "database_service");
containersIpToName.set(process.env.AUTH_IPV4_ADDRESS, "auth_service");
containersIpToName.set(process.env.HUB_IPV4_ADDRESS, "backend_hub");
// 

const my_ip = run_bash_command("getent hosts ${HOSTNAME} | awk '{print $1}'");

if (my_ip === undefined)
{
    throw new Error("'getent hosts ${HOSTNAME} | awk '{print $1}' did not return any output.")
}

// Find executing container ip in the hand coded list of ips above.
// give myself the name listed above.
// Any container failing to do this should throw.

let g_myContainerName = null;

for (const [ip, name] of containersIpToName) 
{
    if (my_ip === ip)
    {
        g_myContainerName = name;
    }
    containersNameToIp.set(name, ip);
}

if (g_myContainerName === undefined)
{
    throw new Error("There is a mismatch between the IP of this container: '" + my_ip + "'). \nIt was not found in list of addresses for all participating containers: " + containersIpToName.values())
}

module.exports = { g_myContainerName, containersNameToIp, containersIpToName };

