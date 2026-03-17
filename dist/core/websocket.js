"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.websocketPlugin = void 0;
const websocketPlugin = async (app) => {
    app.get('/ws', { websocket: true }, (socket) => {
        socket.on('message', (message) => {
            socket.send(JSON.stringify({ type: 'echo', message: message.toString() }));
        });
    });
};
exports.websocketPlugin = websocketPlugin;
