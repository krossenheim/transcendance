'use strict'
const axios = require('axios');
const httpStatus = require('/appservice/httpStatusEnum.cjs');
const { g_myContainerName, containersNameToIp, containersIpToName } = require('/appservice/container_names.cjs');

const fastify = require('fastify')({
	logger: {
		level: 'info', // or 'debug' for more verbosity
		transport: {
			target: 'pino-pretty', // pretty-print logs in development
			options: {
				colorize: true,
				translateTime: 'HH:MM:ss Z',
			}
		}
	}
})

fastify.register(require('@fastify/websocket'))
//////// Token generating and making, needs database and some package 

const openSocketToUserID = new Map();
const openUserIdToSocket = new Map();

function isAuthenticatedHttp(request) {
	const token = request.headers['authorization'] || null;
	const existsToken = authentication_tokenExists(token);
	return (existsToken === true)
}

async function authentication_getUserIdFromToken(token) {
	try {
		const response = await axios({
			method: 'GET',
			url: "/authentication_service/token_exists",
			headers: {
				host: g_myContainerName,
				connection: undefined,
			},
			data: { token: token },
			params: null,
			validateStatus: () => true,
		});
		return (response.data.user_id); //verify what happens when no token-user exists 
	} catch (error) {
		console.error('Error proxying request:', error);
		return (undefined);
	}
}

function parseTokenFromMessage(message) {

	const msgStr = message.toString();
	if (msgStr.startsWith("Authorization: Bearer: ")) {
		const token = msgStr.split(":")[2].trim();
		return token;
	}
	return (undefined);
}

function isAuthenticatedWebsocket(websocket, request, message) {
	if (websocket.user_id === undefined) {
		const token = parseTokenFromMessage(message);
		if (token) {
			websocket.user_id = authentication_getUserIdFromToken(token);
		}
	}
	return (websocket.user_id !== undefined);
}

function parse_websocket_message(message, socket) {
	// Implement your message parsing logic here
	const jsonOut = JSON.parse(message);
	const endpoint = jsonOut.endpoint;
	if (!endpoint)
		socket.send({ error: 'No endpoint specified in message' });
	const payload = jsonOut.payload;

	let newEndpoint, targetContainer;
	if (endpoint.startsWith("/api/public/")) {
		targetContainer = endpoint.split('/')[3];
		newEndpoint = '/api/public/' + endpoint.split('/').slice(4).join('/');
	} else {
		targetContainer = endpoint.split('/')[2];
		newEndpoint = '/api/' + endpoint.split('/').slice(3).join('/');
	}

	return ({ endpoint: newEndpoint, payload: payload, user_id: socket.user_id, targetContainer: targetContainer });
}

function messageAuthenticatesSocket(message) {
	const token = parseTokenFromMessage(message);
	if (token) {
		const user_id = authentication_getUserIdFromToken(token);
		return (user_id);
	}
	return (undefined);
}

const interContainerWebsocketsToName = new Map();
const interContainerNameToWebsockets = new Map();

fastify.register(async function () {
	fastify.get('/inter_container_api', {
		handler: (req, reply) => {

		},
		wsHandler: (socket, req) => {
			if (socket.ipv6_to_ipv4_address === undefined) // 
				socket.ipv6_to_ipv4_address = req.socket.remoteAddress.startsWith("::ffff:") ? req.socket.remoteAddress.slice(7) : req.socket.remoteAddress;
			const containerName = containersIpToName.get(socket.ipv6_to_ipv4_address);
			if (containerName === undefined) {
				socket.send("Goodbye, unauthorized container (Couldnt determine the name of address: '" +  req.socket.remoteAddress + "'");
				socket.close(1008, 'Unauthorized container');
				return;
			}

			if (!interContainerNameToWebsockets.has(containerName)) 
			{
				interContainerNameToWebsockets.set(containerName, socket);
				interContainerWebsocketsToName.set(socket, containerName);
			}
			// MessageFromService 
			// Chatroom says to container/userlist in MessageFromService send payload in MessageFromService
		}
	});
});

fastify.register(async function (instance) {

	fastify.addHook('onRequest', async (request, reply) => {
		const isWebSocket = request.raw.headers.upgrade === 'websocket';
		const isPublic = request.raw.url.startsWith('/api/public/');

		if (!isPublic && !isWebSocket) {
			if (!isAuthenticatedHttp(request)) {
				reply.code(httpStatus.UNAUTHORIZED).send({ error: 'Unauthorized HTTP request' });
				return;
			}
		}
	});
	fastify.get('/ws', {
		handler: (req, reply) => {
			return reply.redirect(httpStatus.SEE_OTHER, '/'); // or any other appropriate action
		},
		wsHandler: (socket, req) => {
			socket.on('connect', () => {
				openSocketToUserID.set(socket, { user_id: undefined });
			});

			socket.on('message', async message => {
				try {
					const request = parse_websocket_message(message, socket);
					if (!request.endpoint.startsWith("/api/public/")) {
						if (!isAuthenticatedWebsocket(socket, req, message)) {
							const user_id = messageAuthenticatesSocket(message)
							if (false && !user_id) {
								socket.send("Goodbye, unauthorized");
								socket.close(1008, 'Unauthorized');
								return;
							}
							socket.user_id = user_id || 1;
							openUserIdToSocket.set(user_id || 1, socket);
						}
					}

					if (!containersNameToIp.has(request.targetContainer)) { 
						socket.send(JSON.stringify({ error: 'Invalid container name \"' + request.targetContainer + '\" in endpoint for target: ' + request.targetContainer }));
						return;
					}

					const url = `http://${request.targetContainer}:` + process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS + `${request.endpoint}`;
					try {
						const response = await axios({
							method: 'POST',
							url,
							headers: {
								'Content-Type': 'application/json',
								host: g_myContainerName,
								connection: undefined,
							},
							data: { ...request.payload, user_id: request.user_id },
							params: null,
							validateStatus: () => true,
						});
						socket.send(JSON.stringify(response.data));
					} catch (error) {
						console.error('Error proxying websocket request:', error);
						socket.send(JSON.stringify({ error: 'Internal Server Error: ' + error.message }));
					}
					// Your logic here
				} catch (err) {
					console.error('WebSocket message error:', err);
					socket.send(JSON.stringify({ error: err.message }));
				}
			});
		}
	}),
		fastify.all('/api/public/:dest/*', async (req, reply) => {
			const { dest } = req.params;
			const restOfUrl = req.url.replace(`${dest}/`, '');
			const url = `http://${dest}:` + process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS + `${restOfUrl}`;
			await proxyRequest(req, reply, req.method, url);
		});

	fastify.all('/api/:dest/*', async (req, reply) => {
		if (!isAuthenticatedHttp(req)) {
			return (reply.code(httpStatus.UNAUTHORIZED));
		}
		const { dest } = req.params;
		const restOfUrl = req.url.replace(`${dest}/`, '');
		const url = `http://${dest}:` + process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS + `${restOfUrl}`;
		await proxyRequest(req, reply, req.method, url);
	});
});

async function proxyRequest(req, reply, method, url) {
	console.log(`Proxying ${method} request to: ${url}`);
	console.log(req.headers);
	console.log(req.body);
	console.log(req.query);
	try {
		const response = await axios({
			method,
			url,
			headers: {
				...req.headers,
				host: undefined,
				connection: undefined,
			},
			data: req.body,
			params: req.query,
			validateStatus: () => true,
		});
		reply.code(response.status).send(response.data);
	} catch (error) {
		console.error('Error proxying request:', error);
		reply.code(500).send({ error: 'Internal Server Error: ' + error.message });
	}
}

fastify.listen({ port: process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS, host: process.env.BACKEND_HUB_BIND_TO }, err => {
	if (err) {
		fastify.log.error(err)
		process.exit(1)
	}
})
