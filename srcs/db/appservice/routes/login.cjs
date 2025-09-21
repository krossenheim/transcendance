const fastify = require('fastify')({ logger: true });
const bcrypt = require('bcrypt');
const { hash } = require('crypto');

const saltRounds = 10;

function hash_password(password) {
    return bcrypt.hashSync(password, saltRounds);
}

async function userRoutes(fastify, options) {
	fastify.get('/login', async (request, reply) => {
		const { username, password } = request.body;
        if (!username || !password) {
            return reply.status(400).send({ error: 'Username and password are required' });
        }

        const hashedPassword = hash_password(password);
        const user = options.database.fetchUserFromCredentials(username, hashedPassword);
		if (user) {
			return reply.status(200).send({ success: true, user: user.privateWebData() });
		} else {
			return reply.status(401).send({ success: false, error: 'Invalid credentials' });
		}
	});

	fastify.post('/create', async (request, reply) => {
		const { username, email, password } = request.body;
		if (!username || !email || !password) {
			return reply.status(400).send({ error: 'Username, email, and password are required' });
		}

		const hashedPassword = hash_password(password);
		const user = options.database.createNewUser(username, email, hashedPassword);
		if (user) {
			return reply.status(201).send(user.privateWebData());
		} else {
			return reply.status(500).send({ error: 'User creation failed' });
		}
	});

	fastify.post('/validate', async (request, reply) => {
		const { username, password } = request.body;
		if (!username || !password) {
			return reply.status(400).send({ error: 'Username and password are required' });
		}
		const user = options.database.fetchUserFromCredentials(username, password);
		if (user) {
			return { success: true, user: user };
		} else {
			return reply.status(401).send({ success: false, error: 'Invalid credentials' });
		}
	});

	fastify.get('/:id', async (request, reply) => {
		console.log(request);
		console.log(2);
		const id = parseInt(request.params.id);
		const user = options.database.fetchUserById(id);
		if (user) {
			return user;
		} else {
			reply.status(404).send({ error: 'User not found' });
		}
	});

	fastify.post('/create', async (request, reply) => {
		console.log(request);
		console.log(3);
		const { username, email, password } = request.body;
		if (!username || !email || !password) {
			reply.status(400).send({ error: 'Username, email, and password are required' });
			return;
		}
		console.log("Creating user:", username, email);
		const user = options.database.createNewUser(username, email, password);
		reply.status(201).send(user);
	});
}

module.exports = userRoutes;
