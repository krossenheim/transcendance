const ip = require('ip');
const { run_bash_command } = require('/appservice/run_bash_command.cjs');

function isFromNginx(address)
{
	const normalized = ip.toString(address); // → "172.18.0.6"
	return (normalized === process.env.NGINX_IPV4_ADDRESS)
}

module.exports = { isFromNginx };