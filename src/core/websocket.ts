import { FastifyPluginAsync } from 'fastify';

export const websocketPlugin: FastifyPluginAsync = async (app) => {
  app.get('/ws', { websocket: true }, (socket) => {
    socket.on('message', (message: Buffer) => {
      socket.send(
        JSON.stringify({ type: 'echo', message: message.toString() }),
      );
    });
  });
};
