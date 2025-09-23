"use strict";
const WebSocket = require('ws');
const socket = new WebSocket('ws://' + process.env.HUB_NAME + ':3000/internalsocket');
socket.on('open', () => {
    console.log('Connected to /internalsocket');
    socket.send('Hello from client!');
});
socket.on('message', (data) => {
    console.log('Received:', data.toString());
});
socket.on('close', () => {
    console.log('Connection closed');
});
socket.on('error', (err) => {
    console.error('Error:', err);
});
