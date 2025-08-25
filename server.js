const fastify = require('fastify')();
const fs = require('fs');
const { execFile } = require('child_process'); // Changed from exec
const path = require('path');

// Helper to generate miniRT scene file
function generateRT(ball, playerY, computerY) {
    // Map game coordinates (0-16) to 3D scene coordinates
    const ballX = (ball.x - 8) * 2; // Center around 0, scale up
    const ballY = (8 - ball.y) * 2; // Flip Y axis for 3D space
    const playerY3D = (8 - playerY) * 2;
    const computerY3D = (8 - computerY) * 2;
    
    return `A 0.3 255,255,255

C 0,0,-25 0,0,1 45

L 10,10,-5 0.7 255,255,255

pl 0,0,0 0,0,1 40,40,40 0 0.1 0.0 0.0

cy -15,${playerY3D},2 0,1,0 1.5 8 30,100,255 0 0.2 0.0 0.0
cy 15,${computerY3D},2 0,1,0 1.5 8 255,50,50 0 0.2 0.0 0.0

sp ${ballX},${ballY},3 1.2 50,255,50 0 0.4 0.0 0.0

pl -20,0,0 1,0,0 100,20,20 0 0.1 0.0 0.0
pl 20,0,0 -1,0,0 20,20,100 0 0.1 0.0 0.0
pl 0,-20,0 0,1,0 50,50,50 0 0.1 0.0 0.0
pl 0,20,0 0,-1,0 50,50,50 0 0.1 0.0 0.0
`;
}

// Queue to prevent multiple concurrent renders
let renderQueue = [];
let isRendering = false;

async function processRenderQueue() {
    if (isRendering || renderQueue.length === 0) return;
    
    isRendering = true;
    const { ball, player, computer, resolve, reject } = renderQueue.shift();
    
    try {
        const rtContent = generateRT(ball, player.y, computer.y);
        const rtFilePath = path.join(__dirname, 'pong_scene.rt');
        
        fs.writeFileSync(rtFilePath, rtContent);
        
        // Run miniRT with execFile (handles spaces in paths properly)
        await new Promise((resolveExec, rejectExec) => {
            execFile('./miniRT', [rtFilePath, '16'], { cwd: __dirname }, (err, stdout, stderr) => {
                if (err) {
                    console.error('MiniRT error:', stderr);
                    rejectExec(err);
                } else {
                    console.log('MiniRT output:', stdout);
                    resolveExec();
                }
            });
        });
        
        resolve();
    } catch (error) {
        reject(error);
    }
    
    isRendering = false;
    setTimeout(processRenderQueue, 0);
}



fastify.post('/api/update-favicon', async (request, reply) => {
    const { ball, player, computer } = request.body;
    
    return new Promise((resolve, reject) => {
        renderQueue.push({ ball, player, computer, resolve, reject });
        processRenderQueue();
    }).then(() => {
        reply.send({ ok: true });
    }).catch((error) => {
        console.error('Render failed:', error);
        reply.code(500).send({ error: 'Render failed' });
    });
});

fastify.get('/favicon.png', async (request, reply) => {
    const filePath = path.join(__dirname, 'favicon.png');
    
    if (!fs.existsSync(filePath)) {
        // Create a default favicon if none exists
        reply.code(404).send('Favicon not found');
        return;
    }
    
    reply.type('image/png').send(fs.createReadStream(filePath));
});

// Serve the HTML file
fastify.get('/', async (request, reply) => {
    const filePath = path.join(__dirname, 'pong.html');
    reply.type('text/html').send(fs.readFileSync(filePath));
});

fastify.listen({ port: 3000, host: '0.0.0.0' }, err => {
    if (err) throw err;
    console.log('🚀 MiniRT Pong Server running on http://localhost:3000');
    console.log('💫 Your 3D raytraced favicon Pong game is ready!');
});