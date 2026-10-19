import type { EmittedMessage } from '@automata/shared';
import type { LogEntry } from '../hooks/useAgentSession';

const STATE_COLORS: Record<string, string> = {
  patrol: '#58a6ff', investigate: '#d29922', chase: '#f0883e', attack: '#f85149',
  search: '#a371f7', returnToPost: '#3fb950', callForBackup: '#db61a2',
};

export function stateColor(state: string): string {
  return STATE_COLORS[state] ?? '#58a6ff';
}

export function StatePanel({ value, status }: { value: unknown; status?: string }) {
  const label = typeof value === 'string' ? value : JSON.stringify(value);
  return (
    <div className="card">
      <h2>Current state {status ? <span className="tag">{status}</span> : null}</h2>
      <div className="nowstate">
        <span className="dot" style={{ background: stateColor(label), boxShadow: `0 0 10px ${stateColor(label)}` }} />
        <span>{label ?? '—'}</span>
      </div>
    </div>
  );
}

export function TransitionLog({ log }: { log: LogEntry[] }) {
  return (
    <div className="card">
      <h2>Transition log <span className="tag">observable</span></h2>
      <div className="log">
        {log.length === 0 && <div className="muted">— no transitions yet —</div>}
        {log.map((l, i) => (
          <div key={i}>
            <span className="from">{l.from}</span> → <span className="to">{l.to}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Big arrays (walls, visibleTiles, long message threads) get summarized.
function truncate(_key: string, val: unknown): unknown {
  if (Array.isArray(val) && val.length > 16) return `[${val.length} items]`;
  if (typeof val === 'string' && val.length > 400) return `${val.slice(0, 400)}…`;
  return val;
}

export function ContextPanel({ context }: { context: unknown }) {
  return (
    <div className="card">
      <h2>Context <span className="tag">assign()</span></h2>
      <pre className="ctx">{JSON.stringify(context, truncate, 2)}</pre>
    </div>
  );
}

export function MessagesPanel({ messages }: { messages: EmittedMessage[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="card">
      <h2>Emitted messages <span className="tag">emit()</span></h2>
      <div className="messages">
        {messages.map((m, i) => (
          <div className="msg" key={i}>
            <span className="ch">{m.channel}</span>
            {m.data}
          </div>
        ))}
      </div>
    </div>
  );
}
