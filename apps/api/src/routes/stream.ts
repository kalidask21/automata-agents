import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { sessions } from '../sessions';

/**
 * WebSocket endpoint: the server pushes `snapshot` / `message` / `transition` /
 * `done` frames in real time, and the client may push `{type:'event', event}`
 * frames (the low-latency path the game uses for MOVE/SHOVE). When the last
 * viewer disconnects, the session is torn down.
 */
export async function streamRoutes(app: FastifyInstance) {
  app.get<{ Params: { actor: string; id: string } }>(
    '/api/agents/:actor/sessions/:id/stream',
    { websocket: true },
    (socket: WebSocket, req) => {
      const { id } = req.params;
      if (!sessions.get(id)) {
        socket.send(JSON.stringify({ type: 'error', error: 'no such session' }));
        socket.close();
        return;
      }

      const unsubscribe = sessions.subscribe(id, (frame) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(frame));
      });

      socket.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg?.type === 'event' && msg.event) sessions.send(id, msg.event);
        } catch {
          /* ignore malformed frames */
        }
      });

      socket.on('close', () => {
        unsubscribe();
        // Clean up the session once nobody is watching it.
        if (sessions.listenerCount(id) === 0) sessions.stop(id);
      });
    },
  );
}
