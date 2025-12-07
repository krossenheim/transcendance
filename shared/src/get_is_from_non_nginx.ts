import * as ip from 'ip';

export default function isFromNginx(address:string)
{
	const normalized = ip.toString(ip.toBuffer(address)); // → "172.18.0.6"
	return (normalized === process.env.NGINX_IPV4_ADDRESS)
}
