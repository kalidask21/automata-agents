/**
 * Shared types between the Fastify API (apps/api) and the React SPA (apps/web).
 * No runtime code — types only — so it can be imported from either side freely.
 */

export type Vec2 = { x: number; y: number };

/** Metadata describing one actor (state machine) the API exposes. */
export type ActorMeta = {
  /** URL key, e.g. "writer" → /api/agents/writer */
  name: string;
  /** Human-friendly id/title. */
  id: string;
  description: string;
  /** Pattern label shown in the UI, e.g. "Tool use", "Reflection". */
  pattern: string;
  /** True for the Dungeon Guardian game (rendered on a canvas, driven by ticks). */
  isGame: boolean;
  /** Does this actor accept USER_MESSAGE chat input? */
  chat: boolean;
  /** Example input used to pre-fill the "start session" form. */
  defaultInput?: unknown;
};

export type ActorStatus = 'active' | 'done' | 'error' | 'stopped';

/** A point-in-time view of a running actor, safe to serialize to JSON. */
export type SnapshotDTO = {
  value: unknown; // XState state value: a string or nested object
  context: unknown;
  status: ActorStatus;
  output?: unknown;
};

/** A message the machine emitted via XState `emit(...)`. */
export type EmittedMessage = {
  channel: 'SYSTEM_MESSAGE' | 'CLIENT_MESSAGE' | 'ADMIN_MESSAGE' | 'ASSISTANT_MESSAGE';
  data: string;
};

/** Events the client can send to an actor. Open-ended so each machine can extend. */
export type AgentEvent =
  | { type: 'USER_MESSAGE'; payload: string }
  | { type: 'APPROVE' }
  | { type: 'DENY' }
  | { type: 'MOVE'; dir: 'up' | 'down' | 'left' | 'right'; sneak?: boolean }
  | { type: 'SHOVE' }
  | { type: string; [key: string]: unknown };

/** Frames the server pushes down the WebSocket. */
export type ServerFrame =
  | { type: 'snapshot'; snapshot: SnapshotDTO }
  | { type: 'message'; message: EmittedMessage }
  | { type: 'transition'; from: string; to: string; event: string }
  | { type: 'done'; output: unknown }
  | { type: 'error'; error: string };

/** Frames the client sends up the WebSocket. */
export type ClientFrame = { type: 'event'; event: AgentEvent };

// ───────────────────────── Dungeon Guardian game ─────────────────────────

export type GuardStateName =
  | 'patrol'
  | 'investigate'
  | 'chase'
  | 'attack'
  | 'search'
  | 'returnToPost'
  | 'callForBackup';

/**
 * The full game world. The API is authoritative: it lives in the guard
 * machine's `context` and is streamed to the SPA, which only renders it.
 */
export type GameWorld = {
  cols: number;
  rows: number;
  walls: string[]; // "x,y" keys
  player: Vec2;
  guard: Vec2;
  facing: Vec2;
  treasure: Vec2;
  exit: Vec2;
  hasTreasure: boolean;
  playerHp: number;
  guardHp: number;
  lastKnownPlayer: Vec2 | null;
  searchTimer: number;
  waypointIndex: number;
  alert: string;
  thought: string;
  visibleTiles: string[]; // tiles the guard can currently perceive
  state: GuardStateName; // mirror of the machine's current state value
  over: null | 'win' | 'caught';
  awaitingOperator: boolean; // true while in callForBackup (human-in-the-loop)
};
