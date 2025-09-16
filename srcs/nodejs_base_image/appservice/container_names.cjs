const { run_bash_command } = require('/appservice/run_bash_command.cjs');

if (process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS === false)
{
      throw new Error("Env var COMMON_PORT_ALL_DOCKER_CONTAINERS not set'" + cname + "'.");
}

if (process.env.CHATROOM_IPV4_ADDRESS === false)
{
      throw new Error("Env var CHATROOM_IPV4_ADDRESS not set'" + cname + "'.");
}

if (process.env.NGINX_IPV4_ADDRESS === false)
{
      throw new Error("Env var NGINX_IPV4_ADDRESS not set'" + cname + "'.");
}

if (process.env.DATABASE_IPV4_ADDRESS === false)
{
      throw new Error("Env var DATABASE_IPV4_ADDRESS not set'" + cname + "'.");
}

if (process.env.AUTH_IPV4_ADDRESS === false)
{
      throw new Error("Env var AUTH_IPV4_ADDRESS not set'" + cname + "'.");
}

if (process.env.HUB_IPV4_ADDRESS === false)
{
      throw new Error("Env var HUB_IPV4_ADDRESS not set'" + cname + "'.");
}

const containersIpToName = new Map();
const containersNameToIp = new Map();

// hardcoded names here

containersIpToName.set(process.env.NGINX_IPV4_ADDRESS, process.env.NGINX_NAME);
containersIpToName.set(process.env.CHATROOM_IPV4_ADDRESS, process.env.CHATROOM_NAME);
containersIpToName.set(process.env.DATABASE_IPV4_ADDRESS, process.env.DATABASE_NAME);
containersIpToName.set(process.env.AUTH_IPV4_ADDRESS, process.env.AUTH_NAME);
containersIpToName.set(process.env.HUB_IPV4_ADDRESS, process.env.HUB_NAME);
// 

const my_address = run_bash_command("getent hosts ${HOSTNAME} | awk '{print $1}'");
console.log("My address is: " + my_address);
if (my_address === false)
{
    throw new Error("'getent hosts ${HOSTNAME} | awk '{print $1}' did not return any output.")
}

// Find executing container listed_address in the hand coded list of ips above.
// give myself the name listed above.
// Any container failing to do this should throw.

let g_myContainerName = false;

console.log("Setting names and ips of participating containers.")
for (const [listed_address, name] of containersIpToName) 
{
    if (my_address === listed_address)
    {
      if (g_myContainerName !== false)
      {
            throw new Error ("Multiple containers same address.");
      }
      g_myContainerName = name;
      console.log("Var g_myContainerName is: " + g_myContainerName);
    }
    if (!run_bash_command("getent hosts " + name + " | awk '{print $1}'") === my_address)
    {
      throw new Error("Invalid service name listed in .env file: " + name);
    }
    console.log("" + name + " is " + listed_address + ".");
    containersNameToIp.set(name, listed_address);
}

if (containersIpToName.size != containersNameToIp.size || containersIpToName.size < 3)
      throw new Error("Need at least 3 containers mapped")
if (g_myContainerName === false)
{
    throw new Error("There is a mismatch between the listed_address of this container: '" + my_address + "'). \nIt was not found in list of addresses for all participating containers: " + Array.from(containersNameToIp.values()));
}

module.exports = { g_myContainerName, containersNameToIp, containersIpToName };

