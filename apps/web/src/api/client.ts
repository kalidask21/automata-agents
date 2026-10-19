import type { ActorMeta, SnapshotDTO, ServerFrame, AgentEvent } from '@automata/shared';

/** Thin REST + WebSocket client for the AutomataAgents API (same-origin /api). */

export async function listAgents(): Promise<ActorMeta[]> {
  const r = await fetch('/api/agents');
  if (!r.ok) throw new Error('could not list agents');
  return r.json();
}

export async function startSession(
  actor: string,
  input?: unknown,
): Promise<{ sessionId: string; snapshot: SnapshotDTO }> {
  const r = await fetch(`/api/agents/${actor}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? 'could not start session');
  return r.json();
}

export async function stopSession(actor: string, id: string): Promise<void> {
  await fetch(`/api/agents/${actor}/sessions/${id}`, { method: 'DELETE' });
}

export function openStream(actor: string, id: string, onFrame: (f: ServerFrame) => void): WebSocket {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/api/agents/${actor}/sessions/${id}/stream`);
  ws.onmessage = (e) => {
    try {
      onFrame(JSON.parse(e.data) as ServerFrame);
    } catch {
      /* ignore */
    }
  };
  return ws;
}

export function sendOverStream(ws: WebSocket | null, event: AgentEvent): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'event', event }));
}
