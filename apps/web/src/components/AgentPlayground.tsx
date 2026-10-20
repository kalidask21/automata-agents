import { useState } from 'react';
import type { ActorMeta } from '@automata/shared';
import { useAgentSession } from '../hooks/useAgentSession';
import { StatePanel, TransitionLog, ContextPanel, MessagesPanel } from './panels';

/** Generic driver for the LLM agents: invoke, watch state/context/log, interact. */
export default function AgentPlayground({ actor }: { actor: ActorMeta }) {
  const { snapshot, messages, log, output, start, send, sessionId } = useAgentSession(actor);
  const [inputText, setInputText] = useState(JSON.stringify(actor.defaultInput ?? {}, null, 2));
  const [chat, setChat] = useState('');

  const onInvoke = () => {
    let input: unknown;
    try {
      input = inputText.trim() ? JSON.parse(inputText) : undefined;
    } catch {
      alert('Input must be valid JSON');
      return;
    }
    start(input);
  };

  const sendChat = () => {
    if (chat.trim()) {
      send({ type: 'USER_MESSAGE', payload: chat.trim() });
      setChat('');
    }
  };

  return (
    <>
      <div className="col left">
        <div className="card">
          <h2>{actor.pattern}</h2>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{actor.id}</div>
          <div className="muted" style={{ fontSize: 13 }}>{actor.description}</div>
          <div className="muted" style={{ margin: '10px 0 4px', fontSize: 12 }}>Input (JSON)</div>
          <textarea rows={5} value={inputText} onChange={(e) => setInputText(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" onClick={onInvoke}>▶ Invoke</button>
            {sessionId && <span className="muted" style={{ fontSize: 12 }}>session {sessionId.slice(0, 8)}…</span>}
          </div>
        </div>

        {snapshot && <StatePanel value={snapshot.value} status={snapshot.status} />}

        {actor.chat && sessionId && (
          <div className="card">
            <h2>Interact</h2>
            <div className="row">
              <button className="good" onClick={() => send({ type: 'APPROVE' })}>✔ Approve</button>
              <button className="bad" onClick={() => send({ type: 'DENY' })}>✘ Deny</button>
            </div>
            <div className="chatbox">
              <input
                value={chat}
                placeholder="message… (try 'approve' / 'deny')"
                onChange={(e) => setChat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
              />
              <button onClick={sendChat}>Send</button>
            </div>
          </div>
        )}

        {actor.events && actor.events.length > 0 && sessionId && (
          <div className="card">
            <h2>Actions</h2>
            <div className="row">
              {actor.events.map((ev) => (
                <button key={ev.type} onClick={() => send({ type: ev.type })}>
                  {ev.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {output != null && (
          <div className="card">
            <h2>Output <span className="tag">final</span></h2>
            <pre className="ctx">{typeof output === 'string' ? output : JSON.stringify(output, null, 2)}</pre>
          </div>
        )}
      </div>

      <div className="col right">
        <MessagesPanel messages={messages} />
        <TransitionLog log={log} />
        {snapshot && <ContextPanel context={snapshot.context} />}
      </div>
    </>
  );
}
