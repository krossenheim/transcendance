const { containerNames } = require('/appservice/_container_names.cjs')
const dns = require("dns");
const net = require("net");

/**
 * Resolve a container name to an IP and check if it is reachable on a port.
 * @param {string} containerName - The Docker service/container name
 * @param {number} port - Port to test connectivity
 */

if ( process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS == undefined)
{
      throw new Error("Env var COMMON_PORT_ALL_DOCKER_CONTAINERS not set'" + cname + "'.");
}
function pingContainer(containerName, port = process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS) {
  dns.lookup(containerName, (err, address) => {
    if (err) {
      console.error(`DNS lookup failed for ${containerName}:`, err.message);
      return (false);
    }

    console.log(`Resolved ${containerName} to ${address}`);

    const socket = net.createConnection(port, address);
    socket.setTimeout(5000);

    socket.on("connect", () => {
      // console.log(`${containerName} is reachable on port ${port}`);
      socket.destroy();
      return (true);
    });

    socket.on("timeout", () => {
      console.error(`${containerName} timed out on port ${port}`);
      socket.destroy();
    });

    socket.on("error", (e) => {
      console.error(`${containerName} connection failed: ${e.message}`);
    });
    return (false);
  });
}

for (const cname of containerNames) 
{ 
  if (pingContainer(cname) == false)
    throw new Error("Could not reach container named: '" + cname + "'.");
}
module.exports = { containerNames };