import { useEffect, useMemo, useState } from 'react';
import type { ActorMeta } from '@automata/shared';
import { listAgents } from './api/client';
import AgentPlayground from './components/AgentPlayground';
import DungeonGuardian from './game/DungeonGuardian';

export default function App() {
  const [agents, setAgents] = useState<ActorMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAgents()
      .then((a) => {
        setAgents(a);
        setSelected((s) => s ?? a[0]?.name ?? null);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const actor = useMemo(() => agents.find((a) => a.name === selected) ?? null, [agents, selected]);

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>🤖 AutomataAgents</h1>
        <div className="sub">Agentic patterns as finite state machines — run on the server, played here.</div>
        {error && (
          <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            Can't reach the API ({error}). Is it running? Try <code>pnpm dev</code>.
          </div>
        )}
        <div className="actorlist">
          {agents.map((a) => (
            <button key={a.name} className={a.name === selected ? 'active' : ''} onClick={() => setSelected(a.name)}>
              <div>
                {a.isGame ? '🎮 ' : ''}
                {a.id}
              </div>
              <div className="pat">{a.pattern}</div>
            </button>
          ))}
        </div>
      </aside>
      <main className="main">
        {actor && actor.isGame && <DungeonGuardian actor={actor} key={actor.name} />}
        {actor && !actor.isGame && <AgentPlayground actor={actor} key={actor.name} />}
        {!actor && !error && <div className="muted">Loading agents…</div>}
      </main>
    </div>
  );
}
