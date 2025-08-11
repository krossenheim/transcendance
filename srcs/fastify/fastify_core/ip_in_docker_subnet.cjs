const ip = require('ip');

function ipInDockerSubnet(ipAddress) {
  if (ipAddress.startsWith('::ffff:')) 
  {
    ipAddress = ipAddress.substring(7);
  }
  return ip.cidrSubnet(process.env.TR_NETWORK_SUBNET).contains(ipAddress);
}

module.exports = ipInDockerSubnet;