import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActorMeta, SnapshotDTO, EmittedMessage, AgentEvent } from '@automata/shared';
import { openStream, sendOverStream, startSession, stopSession } from '../api/client';

export type LogEntry = { from: string; to: string };

/**
 * Starts a server-side actor session, opens its WebSocket stream, and exposes
 * the live snapshot, emitted messages, transition log, and a `send` function.
 */
export function useAgentSession(actor: ActorMeta | null) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotDTO | null>(null);
  const [messages, setMessages] = useState<EmittedMessage[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [output, setOutput] = useState<unknown>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const idRef = useRef<{ actor: string; id: string } | null>(null);

  const stop = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    if (idRef.current) stopSession(idRef.current.actor, idRef.current.id);
    idRef.current = null;
    setSessionId(null);
    setConnected(false);
  }, []);

  const start = useCallback(
    async (input?: unknown) => {
      if (!actor) return;
      stop();
      setSnapshot(null);
      setMessages([]);
      setLog([]);
      setOutput(null);
      const { sessionId: id } = await startSession(actor.name, input);
      idRef.current = { actor: actor.name, id };
      setSessionId(id);
      const ws = openStream(actor.name, id, (f) => {
        if (f.type === 'snapshot') setSnapshot(f.snapshot);
        else if (f.type === 'message') setMessages((m) => [...m, f.message]);
        else if (f.type === 'transition') setLog((l) => [...l, { from: f.from, to: f.to }]);
        else if (f.type === 'done') setOutput(f.output);
      });
      ws.onopen = () => setConnected(true);
      ws.onclose = () => setConnected(false);
      wsRef.current = ws;
    },
    [actor, stop],
  );

  const send = useCallback((event: AgentEvent) => sendOverStream(wsRef.current, event), []);

  // Tear down when the component using this hook unmounts.
  useEffect(() => () => stop(), [stop]);

  return { sessionId, snapshot, messages, log, output, connected, start, send, stop };
}
