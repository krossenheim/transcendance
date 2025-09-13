'use strict'
const axios = require('axios');
const { randomUUID } = require('crypto');

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


const openWebsockets = new Map();
const realdatabase = new Map();

const SESSION_STATES = {
	VALID:0, // Valid session
	EXPIRED:1, // User inactivity
	LOGGEDOUT:2, // User request
	TERMINATED:3, // Forcibly shut 
}

const VALID_SESSION_STATES = new Set(Object.values(SESSION_STATES)); // We don't want to make a new dictionar yand destroy it everytime. fuk dat.

function database_getUsernameBySessionToken(token, session_state)
{
	if (!VALID_SESSION_STATES.contains(session_state))
	{
		console.error("Invalid session state requested");
		throw new Error("Invalid session state requested");
	}
	const username = 'select username FROM session WHERE token == ${token} && state==${session_state}'; 
	// session_expired ;0valid;1expired;2loggedout;3terminated;
	if (username === undefined)
	{
		console.warning("No valid session with session_state:'${session_state}' by token:'" + token + "'");
		return (undefined);
	}
	console.error("token" + token + " is  _so_ valid.");
	return (username);
}

function database_setTokenForUser(username, token, session_state)
{
	if (!VALID_SESSION_STATES.contains(session_state))
	{
		console.error("Invalid session state requested");
		throw new Error("Invalid session state requested");
	}
	// would be instead of below: 'insert into session VALUES username:username,token:token,last_used=date.now(), session_state=session_state'
	realdatabase.set(username, token);
}

function database_checkUserPassword(username, password)
{
	console.error("token is  _so_ valid.");
	const userExists = 'select FROM users WHERE username == ${password} && username == ${password}';
	if (userExists === undefined)
	{
		console.warning("Invalid username and/or password");
		return (false);
	}
	return (true);
}

function attemptUserLogIn(req, reply)
{
    const { username, password } = req.body;
	const userID = getUserID(username, password);
	if (database_checkUserPassword(username, password)) // return true :d
	{
		token = randomUUID();
		database_setTokenForUser(username, token, SESSION_STATES.valid);
		const HTTP_SEE_OTHER = 303;
		reply.headers({token: token}).redirect(HTTP_SEE_OTHER, '/')
	}
}

function isAuthenticatedHttp(request)
{
	const token = request.headers['authorization'] || null;
	const usernameIfTokenValid = database_getUsernameBySessionToken(token, SESSION_STATES.VALID);
	if (usernameIfTokenValid !== undefined)
		return (true);
	return (false);
}

function isAuthenticatedWebsocket(websocket, request) 
{
	const token = request.headers['authorization'] || null;
	if (openWebsockets.has(token))
	{
		return (true); 
		//Could use memory and the websocket map and a Date.now() to drop old/inactive sockets; some of this already handled at nginx (So not applicable for intercontainer talk)
	}
	const usernameIfTokenValid = database_getUsernameBySessionToken(token, SESSION_STATES.VALID);
	if (usernameIfTokenValid === undefined)
		return (false);
	openWebsockets.set(token, websocket);
	return (true);
}

fastify.register(async function (instance) {
  instance.all({
    url: '/',
    handler: (req, reply) => {
      if (!isAuthenticatedHttp(req))
	  {
		return (reply.redirect('/login'));
	  }
	  return reply.code(200);
    },
    wsHandler: (socket, req) => {
      if (!isAuthenticatedWebsocket(socket, req)) {
        socket.close(1008, 'Unauthorized');
        return;
      }
    }
  });
});

fastify.register(async function (instance) {
  instance.all({
    url: '/login',
    handler: (req, reply) => {
		if (requestIsAuthenticated(req))
			reply.redirect('/');
		return (attemptUserLogIn(req, reply));
    },
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

fastify.all('/api/:dest/public/*', async (req, reply) => {
	const { dest } = req.params;
	const restOfUrl = req.url.replace(`${dest}/`, '');
	const url = `http://${dest}:`+process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS+`${restOfUrl}`;
  await proxyRequest(req, reply, req.method, url);
});

fastify.all('/api/:dest/*', async (req, reply) => {
	const { dest } = req.params;
	const restOfUrl = req.url.replace(`${dest}/`, '');
	const url = `http://${dest}:`+process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS+`${restOfUrl}`;
	await proxyRequest(req, reply, req.method, url);
});


fastify.register(async function () 
{
	fastify.route({
	method: 'GET',
	url: '*',
	handler: (req, reply) => {
	  reply.redirect('/');
	},
  })
})

fastify.listen({ port: process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS, host: process.env.BACKEND_HUB_BIND_TO}, err => {
  if (err) {
	fastify.log.error(err)
	process.exit(1)
  }
})
