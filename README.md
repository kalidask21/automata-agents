# 🤖 AutomataAgents

**Agentic patterns as finite state machines — served over HTTP + WebSocket, played from a React SPA.**

AutomataAgents is a refactor of the ideas in [AgenticStateMachines](https://github.com/kalidask21/AgenticStateMachines)
into a clean monorepo. Every agent is an [XState](https://stately.ai/docs) state machine, but instead of
running in the browser, the machines run on a **Fastify API** where **each actor is its own HTTP endpoint**.
The browser is a thin **React + Vite** client that starts sessions, streams live state over a WebSocket, and
plays them — including a server-authoritative game, **Dungeon Guardian**.

> **The thesis:** an AI agent = an Actor + a brain (LLM or policy) + a State Machine. The FSM keeps the agent
> *predictable, observable, and resilient* while the LLM supplies the creativity. Here you can watch every
> state transition happen live.

---

## Why this architecture?

| Concern | Where it lives |
|---|---|
| State machines (the agents) | `apps/api` — run server-side, one addressable endpoint per actor |
| LLM access (Ollama) | `apps/api` only — the browser never holds a key or calls a model |
| Real-time state + messages | WebSocket stream per session |
| Rendering + input | `apps/web` — React SPA, renders snapshots and sends events |
| Shared types | `packages/shared` |

Moving the machines server-side means the LLM/Ollama access stays on the backend, the agent logic becomes a
reusable HTTP service, and multiple clients could watch the same agent.

---

## Quick start

**Prerequisites**
- Node ≥ 20, [pnpm](https://pnpm.io) ≥ 10
- [Ollama](https://ollama.com) running locally with a tool-capable model:
  ```bash
  ollama pull llama3.1:8b
  ```
  (Only the LLM agents need Ollama; the Dungeon Guardian game does not.)

**Run**
```bash
pnpm install
pnpm dev
```
- API → http://localhost:3001
- Web → http://localhost:5173  ← open this

Optional config via a root `.env` (see `.env.example`): `OLLAMA_MODEL`, `OLLAMA_BASE_URL`, `API_PORT`.

---

## The agents

| Actor (`/api/agents/:name`) | Pattern | What it shows |
|---|---|---|
| `writer` | Tool use | Calls `get_inventory` before writing a recipe. `writing ⇄ using_tool → done`. |
| `reflection` | Reflection | A writer and a critic refine a recipe over bounded loops. |
| `critic` | Single-step LLM | One-shot nutritionist critique. |
| `human-in-the-loop` | Human-in-the-loop | Parks in `approval_required` until an operator Approves/Denies tool use. |
| `writer-chat` | Interactive agent | Long-running chat; stays alive between turns. |
| `collaboration` | Orchestration / routing | A planner routes work to specialist sub-agents, then a summarizer pitches the result. |
| `dungeon-guardian` | Game / autonomous loop | The playable game — a guard NPC as a state machine. |

> The original repo's `code_execution` ("chartering") actor is intentionally **not** ported: it was coupled to
> the browser inspector and `eval`'d LLM output into a child machine with no terminal state. It needs a redesign
> to run safely server-side.

---

## API (each actor = a resource)

```
GET    /api/agents                                 → list actors + metadata
POST   /api/agents/:actor/sessions                 → start an instance → { sessionId, snapshot }
GET    /api/agents/:actor/sessions/:id             → current snapshot { value, context, status, output }
POST   /api/agents/:actor/sessions/:id/events      → send one event (USER_MESSAGE, APPROVE/DENY, MOVE/SHOVE…)
DELETE /api/agents/:actor/sessions/:id             → stop + discard
WS     /api/agents/:actor/sessions/:id/stream      → live snapshot / message / transition / done frames
```

The WebSocket is bidirectional: the server pushes frames, and the client can push
`{ type: "event", event }` (the low-latency path the game uses for movement).

---

## 🛡️ Dungeon Guardian (the game)

You're the thief 🥷 — grab the 💎 and reach the 🚪 without getting caught. The guard is a state machine running
**on the server**; the browser renders the world it streams and sends your input events.

- **Move:** Arrows / WASD · **Sneak (silent):** hold Shift · **Shove guard:** Space (when adjacent)
- States: `patrol → investigate → chase → attack → search → returnToPost`, plus `callForBackup`
  (a **human-in-the-loop**: wound the guard and it halts to ask *you* for permission to retreat).
- The orange cone is the guard's **perception** (line-of-sight); the purple square is its **memory** (last known
  position). Break line of sight to force it from `chase` into `search`.

At ~2 ticks/second the WebSocket round-trip is imperceptible, so the game stays server-authoritative like the
LLM agents — every state machine is exposed the same way.

---

## Project layout

```
automata-agents/
├─ apps/
│  ├─ api/   Fastify + XState machines + session/WebSocket layer
│  │  └─ src/machines/   writer, reflection, critic, human-in-the-loop,
│  │                     writer-chat, collaboration, dungeon-guardian
│  └─ web/   React + Vite SPA (AgentPlayground + DungeonGuardian)
└─ packages/
   └─ shared/   TypeScript types shared by both apps
```

## Scripts

```bash
pnpm dev         # run API + web together (turbo)
pnpm build       # typecheck/build all packages
pnpm typecheck   # type-check every package
```

## Tech

pnpm workspaces · Turborepo · TypeScript · XState v5 · Fastify 5 (+ `@fastify/websocket`) · React 18 · Vite 5 ·
OpenAI SDK pointed at local Ollama.
