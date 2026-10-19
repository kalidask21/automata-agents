import { randomUUID } from 'node:crypto';
import { createActor, type Actor, type AnyStateMachine } from 'xstate';
import type { SnapshotDTO, ServerFrame, ActorStatus } from '@automata/shared';
import { registry } from './registry';
import { TICK_MS } from './machines/dungeon-guardian';

type Listener = (frame: ServerFrame) => void;

type Session = {
  id: string;
  name: string;
  isGame: boolean;
  actor: Actor<AnyStateMachine>;
  listeners: Set<Listener>;
  tick?: ReturnType<typeof setInterval>;
  prevValue: string;
};

const EMIT_CHANNELS = ['SYSTEM_MESSAGE', 'CLIENT_MESSAGE', 'ADMIN_MESSAGE', 'ASSISTANT_MESSAGE'] as const;

const valueToString = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));

function toSnapshot(actor: Actor<AnyStateMachine>): SnapshotDTO {
  const s = actor.getSnapshot();
  return { value: s.value, context: s.context, status: s.status as ActorStatus, output: s.output };
}

/**
 * Owns the lifecycle of running actors. One actor = one session. Bridges XState
 * (state subscription + emitted messages) to a per-session listener set that the
 * WebSocket route forwards to the browser. Game sessions get a tick loop.
 */
class SessionManager {
  private sessions = new Map<string, Session>();

  create(name: string, input: unknown): string {
    const entry = registry[name];
    if (!entry) throw new Error(`unknown actor: ${name}`);

    const id = randomUUID();
    const actor = createActor(entry.machine, input != null ? { input } : undefined) as Actor<AnyStateMachine>;
    const session: Session = { id, name, isGame: entry.meta.isGame, actor, listeners: new Set(), prevValue: '' };

    // Stream every state change + a fresh snapshot.
    actor.subscribe((snap) => {
      const value = valueToString(snap.value);
      if (value !== session.prevValue) {
        this.broadcast(session, { type: 'transition', from: session.prevValue || '(start)', to: value, event: 'event' });
        session.prevValue = value;
      }
      this.broadcast(session, { type: 'snapshot', snapshot: toSnapshot(actor) });
      if (snap.status === 'done') {
        this.broadcast(session, { type: 'done', output: snap.output });
        this.clearTick(session);
      }
    });

    // Forward messages emitted via XState `emit(...)`.
    for (const ch of EMIT_CHANNELS) {
      actor.on(ch as never, (ev: { data?: unknown }) => {
        const data = typeof ev.data === 'object' ? JSON.stringify(ev.data) : String(ev.data ?? '');
        this.broadcast(session, { type: 'message', message: { channel: ch, data } });
      });
    }

    actor.start();
    session.prevValue = valueToString(actor.getSnapshot().value);

    // Drive the game forward on a timer; pause on game-over / human-in-the-loop.
    if (entry.meta.isGame) {
      session.tick = setInterval(() => {
        const ctx = actor.getSnapshot().context as { world?: { over?: unknown; awaitingOperator?: boolean } };
        if (ctx?.world?.over || ctx?.world?.awaitingOperator) return;
        actor.send({ type: 'TICK' });
      }, TICK_MS);
    }

    this.sessions.set(id, session);
    return id;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  snapshot(id: string): SnapshotDTO | undefined {
    const s = this.get(id);
    return s ? toSnapshot(s.actor) : undefined;
  }

  send(id: string, event: unknown): SnapshotDTO | undefined {
    const s = this.get(id);
    if (!s) return undefined;
    s.actor.send(event as never);
    return toSnapshot(s.actor);
  }

  subscribe(id: string, listener: Listener): () => void {
    const s = this.get(id);
    if (!s) return () => {};
    s.listeners.add(listener);
    listener({ type: 'snapshot', snapshot: toSnapshot(s.actor) });
    return () => s.listeners.delete(listener);
  }

  listenerCount(id: string): number {
    return this.get(id)?.listeners.size ?? 0;
  }

  stop(id: string): void {
    const s = this.get(id);
    if (!s) return;
    this.clearTick(s);
    s.actor.stop();
    this.sessions.delete(id);
  }

  private clearTick(s: Session): void {
    if (s.tick) {
      clearInterval(s.tick);
      s.tick = undefined;
    }
  }

  private broadcast(s: Session, frame: ServerFrame): void {
    for (const l of s.listeners) l(frame);
  }
}

export const sessions = new SessionManager();
