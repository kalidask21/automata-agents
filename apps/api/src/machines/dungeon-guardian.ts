import { setup } from 'xstate';
import type { GameWorld, GuardStateName, Vec2 } from '@automata/shared';

/**
 * DUNGEON GUARDIAN — the agentic game as a real XState machine, running
 * server-side. The whole world lives in `context.world` and is streamed to the
 * SPA, which only renders it and sends input events (MOVE/SHOVE/APPROVE/DENY).
 *
 * Each TICK the guard runs sense → think → act:
 *   - SENSE: perception (line-of-sight cone, hearing, adjacency) is computed by
 *     pure guard functions over the world (+ a noise timestamp for freshness).
 *   - THINK: the per-state ordered TICK transitions pick the first matching guard.
 *   - ACT: the chosen transition's action moves the guard (BFS) and updates memory.
 *
 * Note: for readability the action functions mutate `context.world` in place
 * (the HTML prototype did the same). Idiomatic XState uses immutable `assign`;
 * the behavior is identical because the world is re-serialized every tick.
 */

const LEVEL = [
  '###############',
  '#P...........E#',
  '#.###.###.###.#',
  '#.............#',
  '#.##.#.#.#.##.#',
  '#......T......#',
  '#.##.#.#.#.##.#',
  '#.............#',
  '#.###.###.###.#',
  '#.....G.......#',
  '###############',
];
const COLS = LEVEL[0].length;
const ROWS = LEVEL.length;

const VISION_RANGE = 6;
const CONE_COS = 0.35; // ~70° half-cone
const HEAR_RADIUS = 3;
const SEARCH_TICKS = 6;
const HIL_HP = 30;
export const TICK_MS = 450;

type Ctx = {
  world: GameWorld;
  post: Vec2;
  waypoints: Vec2[];
  backupDenied: boolean;
  noiseStamp: number; // Date.now() of the player's last noisy move
};

// ───────────────────────── pure world helpers ─────────────────────────
const key = (x: number, y: number) => `${x},${y}`;
const same = (a: Vec2 | null, b: Vec2 | null) => !!a && !!b && a.x === b.x && a.y === b.y;
const manhattan = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const isWall = (walls: Set<string>, x: number, y: number) => walls.has(key(x, y));

function lineOfSightClear(walls: Set<string>, a: Vec2, b: Vec2): boolean {
  let x0 = a.x,
    y0 = a.y;
  const x1 = b.x,
    y1 = b.y;
  const dx = Math.abs(x1 - x0),
    dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
    if (x0 === x1 && y0 === y1) break;
    if (isWall(walls, x0, y0)) return false;
  }
  return true;
}

function canSee(walls: Set<string>, guard: Vec2, facing: Vec2, target: Vec2): boolean {
  const d = Math.hypot(target.x - guard.x, target.y - guard.y);
  if (d > VISION_RANGE) return false;
  if (d <= 1) return true;
  const len = d || 1;
  const dot = ((target.x - guard.x) / len) * facing.x + ((target.y - guard.y) / len) * facing.y;
  if (dot < CONE_COS) return false;
  return lineOfSightClear(walls, guard, target);
}

function visibleTiles(walls: Set<string>, guard: Vec2, facing: Vec2): string[] {
  const out: string[] = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      if (isWall(walls, x, y)) continue;
      if (canSee(walls, guard, facing, { x, y })) out.push(key(x, y));
    }
  return out;
}

function bfsStep(walls: Set<string>, from: Vec2, to: Vec2): Vec2 {
  if (same(from, to)) return from;
  const q: Vec2[] = [from];
  const prev: Record<string, Vec2 | null> = { [key(from.x, from.y)]: null };
  const seen = new Set([key(from.x, from.y)]);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (q.length) {
    const c = q.shift()!;
    if (same(c, to)) break;
    for (const [dx, dy] of dirs) {
      const nx = c.x + dx,
        ny = c.y + dy,
        k = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || isWall(walls, nx, ny) || seen.has(k)) continue;
      seen.add(k);
      prev[k] = c;
      q.push({ x: nx, y: ny });
    }
  }
  let cur = to;
  if (!(key(cur.x, cur.y) in prev)) return from; // unreachable
  while (prev[key(cur.x, cur.y)] && !same(prev[key(cur.x, cur.y)], from)) cur = prev[key(cur.x, cur.y)]!;
  return cur;
}

// A reusable wall set (level is static), rebuilt per context for isolation.
function parseLevel() {
  const walls = new Set<string>();
  let player!: Vec2, guard!: Vec2, treasure!: Vec2, exit!: Vec2;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const c = LEVEL[y][x];
      if (c === '#') walls.add(key(x, y));
      if (c === 'P') player = { x, y };
      if (c === 'G') guard = { x, y };
      if (c === 'T') treasure = { x, y };
      if (c === 'E') exit = { x, y };
    }
  return { walls, player, guard, treasure, exit };
}

function buildContext(): Ctx {
  const { walls, player, guard, treasure, exit } = parseLevel();
  const facing: Vec2 = { x: 0, y: -1 };
  const world: GameWorld = {
    cols: COLS,
    rows: ROWS,
    walls: [...walls],
    player: { ...player },
    guard: { ...guard },
    facing,
    treasure: { ...treasure },
    exit: { ...exit },
    hasTreasure: false,
    playerHp: 3,
    guardHp: 100,
    lastKnownPlayer: null,
    searchTimer: 0,
    waypointIndex: 0,
    alert: 'calm',
    thought: 'All quiet. Walking my rounds.',
    visibleTiles: visibleTiles(walls, guard, facing),
    state: 'patrol',
    over: null,
    awaitingOperator: false,
  };
  return {
    world,
    post: { ...guard },
    waypoints: [
      { x: 1, y: 3 },
      { x: 13, y: 3 },
      { x: 13, y: 7 },
      { x: 1, y: 7 },
    ],
    backupDenied: false,
    noiseStamp: 0,
  };
}

// Mutating helpers used by action functions.
const wallsOf = (c: Ctx) => new Set(c.world.walls);
function moveGuardTo(c: Ctx, target: Vec2 | null) {
  if (!target) return;
  const walls = wallsOf(c);
  const next = bfsStep(walls, c.world.guard, target);
  if (!same(next, c.world.guard)) {
    c.world.facing = { x: Math.sign(next.x - c.world.guard.x), y: Math.sign(next.y - c.world.guard.y) };
    c.world.guard = next;
  }
  c.world.visibleTiles = visibleTiles(walls, c.world.guard, c.world.facing);
}
function refreshVision(c: Ctx) {
  c.world.visibleTiles = visibleTiles(wallsOf(c), c.world.guard, c.world.facing);
}
const enter =
  (state: GuardStateName, alert: string, thought: string) =>
  ({ context: c }: { context: Ctx }) => {
    c.world.state = state;
    c.world.alert = alert;
    c.world.thought = thought;
    c.world.awaitingOperator = false;
    refreshVision(c);
  };

const machine = setup({
  types: {
    context: {} as Ctx,
  },
  guards: {
    hpLow: ({ context }) => context.world.guardHp <= HIL_HP && !context.backupDenied,
    sees: ({ context }) => canSee(wallsOf(context), context.world.guard, context.world.facing, context.world.player),
    hears: ({ context }) =>
      Date.now() - context.noiseStamp <= TICK_MS * 1.2 && manhattan(context.world.guard, context.world.player) <= HEAR_RADIUS,
    adjacent: ({ context }) => manhattan(context.world.guard, context.world.player) === 1,
    reachedLastKnown: ({ context }) => same(context.world.guard, context.world.lastKnownPlayer),
    atPost: ({ context }) => same(context.world.guard, context.post),
    searchExpired: ({ context }) => context.world.searchTimer <= 0,
  },
  actions: {
    // memory
    remember: ({ context }) => {
      context.world.lastKnownPlayer = { ...context.world.player };
    },
    rememberNoise: ({ context }) => {
      context.world.lastKnownPlayer = { ...context.world.player };
    },
    // movement (the "act")
    patrolStep: ({ context }) => {
      const wp = context.waypoints[context.world.waypointIndex];
      if (same(context.world.guard, wp)) context.world.waypointIndex = (context.world.waypointIndex + 1) % context.waypoints.length;
      moveGuardTo(context, context.waypoints[context.world.waypointIndex]);
    },
    toLastKnown: ({ context }) => moveGuardTo(context, context.world.lastKnownPlayer),
    chaseStep: ({ context }) => {
      context.world.lastKnownPlayer = { ...context.world.player };
      moveGuardTo(context, context.world.player);
    },
    searchStep: ({ context }) => {
      context.world.searchTimer -= 1;
      moveGuardTo(context, context.world.lastKnownPlayer);
    },
    toPost: ({ context }) => moveGuardTo(context, context.post),
    strike: ({ context }) => {
      context.world.playerHp -= 1;
      context.world.thought = 'Gotcha!';
      if (context.world.playerHp <= 0) context.world.over = 'caught';
    },
    // entries
    enterPatrol: enter('patrol', 'calm', 'All quiet. Walking my rounds.'),
    enterInvestigate: enter('investigate', 'suspicious', 'Hm? I heard something over there.'),
    enterChase: enter('chase', 'alarmed', 'There you are, thief!'),
    enterAttack: enter('attack', 'alarmed', 'Stop right there!'),
    enterSearch: ({ context: c }: { context: Ctx }) => {
      c.world.searchTimer = SEARCH_TICKS;
      enter('search', 'searching', 'Where did they go? Check the last spot...')({ context: c });
    },
    enterReturn: enter('returnToPost', 'calm', 'Must have been nothing. Heading back.'),
    enterHIL: ({ context: c }: { context: Ctx }) => {
      c.world.state = 'callForBackup';
      c.world.alert = 'wounded';
      c.world.thought = "I'm hurt! Operator — permission to fall back?";
      c.world.awaitingOperator = true;
      refreshVision(c);
    },
    approveBackup: ({ context }) => {
      context.world.guardHp = 100;
      context.backupDenied = false;
    },
    denyBackup: ({ context }) => {
      context.backupDenied = true;
    },
    // player input
    movePlayer: ({ context, event }) => {
      if (context.world.over) return;
      const dirs: Record<string, Vec2> = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
      };
      const d = dirs[(event as any).dir];
      if (!d) return;
      const nx = context.world.player.x + d.x,
        ny = context.world.player.y + d.y;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || isWall(wallsOf(context), nx, ny)) return;
      context.world.player = { x: nx, y: ny };
      if (!(event as any).sneak) context.noiseStamp = Date.now();
      if (same(context.world.player, context.world.treasure) && !context.world.hasTreasure) context.world.hasTreasure = true;
      if (same(context.world.player, context.world.exit) && context.world.hasTreasure) context.world.over = 'win';
    },
    shove: ({ context }) => {
      if (context.world.over) return;
      if (manhattan(context.world.player, context.world.guard) !== 1) return;
      context.world.guardHp = Math.max(0, context.world.guardHp - 25);
      context.noiseStamp = Date.now();
    },
  },
}).createMachine({
  id: 'Dungeon Guardian',
  initial: 'patrol',
  context: buildContext,
  // Player input works in every state.
  on: {
    MOVE: { actions: 'movePlayer' },
    SHOVE: { actions: 'shove' },
  },
  states: {
    patrol: {
      entry: 'enterPatrol',
      on: {
        TICK: [
          { guard: 'hpLow', target: 'callForBackup' },
          { guard: 'sees', target: 'chase', actions: 'remember' },
          { guard: 'hears', target: 'investigate', actions: 'rememberNoise' },
          { actions: 'patrolStep' },
        ],
      },
    },
    investigate: {
      entry: 'enterInvestigate',
      on: {
        TICK: [
          { guard: 'hpLow', target: 'callForBackup' },
          { guard: 'sees', target: 'chase', actions: 'remember' },
          { guard: 'reachedLastKnown', target: 'returnToPost' },
          { actions: 'toLastKnown' },
        ],
      },
    },
    chase: {
      entry: 'enterChase',
      on: {
        TICK: [
          { guard: 'hpLow', target: 'callForBackup' },
          { guard: 'adjacent', target: 'attack' },
          { guard: 'sees', actions: 'chaseStep' },
          { target: 'search' },
        ],
      },
    },
    attack: {
      entry: 'enterAttack',
      on: {
        TICK: [
          { guard: 'hpLow', target: 'callForBackup' },
          { guard: 'adjacent', actions: 'strike' },
          { guard: 'sees', target: 'chase' },
          { target: 'search' },
        ],
      },
    },
    search: {
      entry: 'enterSearch',
      on: {
        TICK: [
          { guard: 'hpLow', target: 'callForBackup' },
          { guard: 'sees', target: 'chase', actions: 'remember' },
          { guard: 'searchExpired', target: 'returnToPost' },
          { actions: 'searchStep' },
        ],
      },
    },
    returnToPost: {
      entry: 'enterReturn',
      on: {
        TICK: [
          { guard: 'sees', target: 'chase', actions: 'remember' },
          { guard: 'hears', target: 'investigate', actions: 'rememberNoise' },
          { guard: 'atPost', target: 'patrol' },
          { actions: 'toPost' },
        ],
      },
    },
    // HUMAN-IN-THE-LOOP: no TICK handler — the machine waits for the operator.
    callForBackup: {
      entry: 'enterHIL',
      on: {
        APPROVE: { target: 'returnToPost', actions: 'approveBackup' },
        DENY: { target: 'chase', actions: 'denyBackup' },
      },
    },
  },
});

export default machine;
