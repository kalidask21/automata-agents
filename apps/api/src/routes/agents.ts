import type { FastifyInstance } from 'fastify';
import { registry } from '../registry';
import { sessions } from '../sessions';

type ActorParams = { actor: string };
type SessionParams = { actor: string; id: string };

/** REST endpoints — one addressable resource per actor. */
export async function agentRoutes(app: FastifyInstance) {
  // List all actors the server exposes.
  app.get('/api/agents', async () => Object.values(registry).map((e) => e.meta));

  // Start a new instance of an actor → returns a session id + initial snapshot.
  app.post<{ Params: ActorParams; Body: { input?: unknown } }>('/api/agents/:actor/sessions', async (req, reply) => {
    const { actor } = req.params;
    if (!registry[actor]) return reply.code(404).send({ error: `unknown actor: ${actor}` });
    try {
      const id = sessions.create(actor, req.body?.input);
      return { sessionId: id, snapshot: sessions.snapshot(id) };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // Read the current snapshot of a running actor.
  app.get<{ Params: SessionParams }>('/api/agents/:actor/sessions/:id', async (req, reply) => {
    const snap = sessions.snapshot(req.params.id);
    if (!snap) return reply.code(404).send({ error: 'no such session' });
    return snap;
  });

  // Send one event to an actor (USER_MESSAGE, APPROVE/DENY, MOVE/SHOVE, …).
  app.post<{ Params: SessionParams; Body: unknown }>('/api/agents/:actor/sessions/:id/events', async (req, reply) => {
    const snap = sessions.send(req.params.id, req.body);
    if (!snap) return reply.code(404).send({ error: 'no such session' });
    return snap;
  });

  // Stop and discard a session.
  app.delete<{ Params: SessionParams }>('/api/agents/:actor/sessions/:id', async (req) => {
    sessions.stop(req.params.id);
    return { ok: true };
  });
}
