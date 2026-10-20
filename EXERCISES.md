# 🍳 AutomataAgents — Exercises & Pattern Playbook

A hands-on guide to the agentic **finite-state-machine** patterns in this repo, themed as a meal-prep kitchen
("Mise"). Each station teaches **one** pattern. Use this to learn in depth and to practice extending the machines.

> **Core idea:** an agent = an **Actor** + a **brain** (an LLM, or just a policy) + a **State Machine**.
> The state machine decides *which actions are even allowed right now*; the brain decides *what to do* within
> that structure. That's what makes an agent predictable, observable, and safe.

## How to run & practice

```bash
pnpm install
pnpm dev          # API :3001, Web :5173 — open the web app
```
Requires [Ollama](https://ollama.com) for the LLM stations (`ollama pull llama3.1:8b`); the `oven-timer` and
`dungeon-guardian` need no LLM. In the web app: pick a station → **Invoke** → watch the **current state**,
**context**, **transition log**, and **emitted messages** update live. The machines live in
`apps/api/src/machines/`. Add a station once and it appears in the UI automatically (see "Add your own" below).

---

## The 8 patterns

### 1. Tool use — `menu-planner` (`apps/api/src/machines/writer.ts`)
**Teaches:** an agent that must *fetch information* before it can answer. The LLM decides to call a tool; the
FSM runs the tool, feeds the result back, and loops until the LLM is done.
**XState mechanics:** `invoke` a `fromPromise` actor; a guarded `onDone: [{ guard, target }, …]` array routes
"did the model request a tool?" → `using_tool`, else → `done`.
**Watch:** `writing → using_tool → writing → done`.
**Exercises**
- 🟢 Add a second tool `get_equipment` (oven, blender, grill) and require the recipe to only use owned equipment.
- 🟡 Add a `max_tool_calls` guard so the agent can't loop forever; transition to an `error` state when exceeded.
- 🔴 Make tools run in parallel (two `invoke`s in a parallel state) and merge results before writing.

### 2. Single-step LLM — `nutritionist` (`critic.ts`)
**Teaches:** the simplest agent — one state, one LLM call, one output. The baseline everything else builds on.
**XState mechanics:** a single `invoke` whose `onDone` goes straight to a `final` state with `output`.
**Exercises**
- 🟢 Change the persona (e.g., a budget-conscious chef) and compare outputs.
- 🟡 Add an `allergens` input and have it return structured JSON; validate it before reaching `final`.
- 🔴 Add a retry state: if the JSON is invalid, loop back and re-prompt (bounded by a counter).

### 3. Reflection — `recipe-refiner` (`reflection.ts`)
**Teaches:** two agents improving each other's work (writer drafts, critic critiques, writer revises).
**XState mechanics:** invoke the `menu-planner` and `nutritionist` machines as **sub-actors**; a `loopCount <
maxLoopCount` guard bounds the refinement rounds.
**Watch:** `writing → critiquing → writing → … → done`.
**Exercises**
- 🟢 Raise `maxLoopCount` to 3 and read how the recipe changes each round.
- 🟡 Add a "good enough" guard: stop early when the critic replies with no changes.
- 🔴 Add a third reviewer (a "food cost" agent) and rotate through all three before revising.

### 4. Orchestration / routing — `kitchen-orchestrator` (`collaboration.ts`)
**Teaches:** a planner ("head chef") that decides *which specialist to run next* by calling tools, looping back
after each until it calls `done`.
**XState mechanics:** a `Planning` state with a guarded `onDone` array that routes to specialist states
(`Writing Recipe`, `Procuring`, …), each of which returns to `Planning`.
**Watch:** `Planning → Writing Recipe → Planning → Procuring → … → Summarizing → Done`.
**Exercises**
- 🟢 Add a `platingAgent` specialist and a matching planner tool.
- 🟡 Enforce ordering with guards (can't prep before procuring) and surface a clear error if the plan is wrong.
- 🔴 Replace the fake specialists with real sub-machines (like `recipeAgent` already uses the menu planner).

### 5. Human-in-the-loop — `dietary-gate` (`human-in-the-loop.ts`)
**Teaches:** the machine *pauses* in a state and will not proceed until a human sends an event.
**XState mechanics:** an `approval_required` state with only `on: { USER_MESSAGE | APPROVE | DENY }` — no
automatic transition. Approve → run the tool; Deny → record the refusal and re-plan.
**Watch:** `writing → approval_required` (halts) → Approve/Deny.
**Exercises**
- 🟢 Add a timeout (`after: { 30000: 'denied' }`) so no response = auto-deny.
- 🟡 Carry the human's free-text reason into context and feed it back to the LLM on deny.
- 🔴 Require *two* approvals (a `pending_second_approval` state) for high-risk ingredients.

### 6. Interactive agent — `sous-chef` (`writer-chat.ts`)
**Teaches:** a long-running agent that sits in `idle` between turns and keeps conversation state.
**XState mechanics:** an `idle` state waiting for `USER_MESSAGE`; the machine never reaches `final`, so the
session stays alive. Context accumulates the full message thread (memory).
**Exercises**
- 🟢 Add a `/reset` command that clears the thread back to the system prompt.
- 🟡 Add a `summarize` state that compresses old messages when the thread gets long (context-window management).
- 🔴 Give it two tools and let the conversation drive which one is used.

### 7. Pure FSM (no LLM) — `oven-timer` (`oven-timer.ts`)
**Teaches:** the punchline of the whole repo — **the state machine is the backbone; the LLM is optional.**
Timing, windows, and failure states need no model at all.
**XState mechanics:** delayed transitions `after: { 4000: 'ready' }`; a `PLATE` event wins the race against the
burn timer; two `final` states (`plated`, `burnt`).
**Watch:** `cooking → ready → burnt`, or `ready --PLATE--> plated`.
**Exercises**
- 🟢 Make the cook/burn windows configurable from input.
- 🟡 Add a `FLIP` event mid-cook that resets the burn timer (re-enter the state).
- 🔴 Model a whole stove: a **parallel** state with 4 independent burners, each its own timer.

### 8. Autonomous loop / game — `dungeon-guardian` (`dungeon-guardian.ts`)
**Teaches:** a real-time sense→think→act loop; perception as "tools", memory in context, guarded transitions,
plus a human-in-the-loop. Server-authoritative, streamed over WebSocket.
**XState mechanics:** per-state ordered `TICK` transitions whose guards read computed perception; movement in
transition actions; a `callForBackup` state that waits for the operator.
**Exercises**
- 🟢 Widen/narrow the vision cone (`CONE_COS`) or vision range and feel the difference.
- 🟡 Add a `taunt` state entered from `attack` every few ticks.
- 🔴 Reskin it into a **Line Cook** game: an autonomous cook works stations as orders queue, and you're the
  expeditor who approves finished plates (HIL).

---

## Design your own (future practice)

Every real system below is a state machine with an LLM in a few of the states. Pick one, map the states, then
implement it as a new station.

| Scenario | Patterns to combine | Suggested states |
|---|---|---|
| 🎧 Support ticket triage | routing + tool use + HIL | `classify → gather → resolve → escalate(HIL) → closed` |
| 🏦 Loan / KYC underwriting | tool use + HIL + audit | `intake → verify_docs → risk_score → human_approval → decided` |
| ✈️ Trip planner & booker | orchestration + reflection | `plan → check_availability → optimize → confirm(HIL) → booked` |
| 🏠 Smart-home routine | autonomous loop (no LLM) | `home ⇄ away ⇄ night` driven by sensor ticks |
| 🚨 Incident-response runbook | routing + tool use + HIL | `detect → diagnose → remediate → escalate → resolved` |

### Add a new station (the whole loop)
1. Create `apps/api/src/machines/<name>.ts` — a `setup(...).createMachine(...)` (copy the closest existing one).
2. Register it in `apps/api/src/registry.ts` with an `ActorMeta` (set `chat`, `events`, `isGame`, `defaultInput`).
3. That's it — the React SPA reads `/api/agents` and renders your station automatically. LLM stations get the
   chat box; `events` render as action buttons; `isGame: true` renders on the canvas.
4. Run `pnpm typecheck`, then `pnpm dev` and try it.

> Tip: start by drawing the states and transitions on paper. If you can draw it, you can build it — that's the
> whole appeal of modeling agents as finite state machines.
