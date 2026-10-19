import { useEffect, useRef } from 'react';
import type { ActorMeta, GameWorld } from '@automata/shared';
import { useAgentSession } from '../hooks/useAgentSession';
import { StatePanel, TransitionLog, stateColor } from '../components/panels';

const TILE = 36;

const KEY_DIR: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down',
  ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right',
};

function draw(canvas: HTMLCanvasElement, world: GameWorld) {
  const c = canvas.getContext('2d');
  if (!c) return;
  canvas.width = world.cols * TILE;
  canvas.height = world.rows * TILE;
  const walls = new Set(world.walls);

  for (let y = 0; y < world.rows; y++) {
    for (let x = 0; x < world.cols; x++) {
      const px = x * TILE, py = y * TILE;
      if (walls.has(`${x},${y}`)) {
        c.fillStyle = '#20262f';
        c.fillRect(px, py, TILE, TILE);
        c.strokeStyle = '#2b3340';
        c.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      } else {
        c.fillStyle = '#0d1117';
        c.fillRect(px, py, TILE, TILE);
        c.strokeStyle = '#161b22';
        c.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      }
    }
  }

  // vision cone (the guard's perception, made visible)
  c.fillStyle = 'rgba(240,136,62,0.16)';
  for (const k of world.visibleTiles) {
    const [x, y] = k.split(',').map(Number);
    c.fillRect(x * TILE, y * TILE, TILE, TILE);
  }

  // last known player position (memory)
  if (world.lastKnownPlayer) {
    const { x, y } = world.lastKnownPlayer;
    c.strokeStyle = '#a371f7';
    c.lineWidth = 2;
    c.strokeRect(x * TILE + 6, y * TILE + 6, TILE - 12, TILE - 12);
    c.lineWidth = 1;
    c.fillStyle = '#a371f7';
    c.font = '9px ui-monospace';
    c.fillText('mem', x * TILE + 10, y * TILE + 22);
  }

  const glyph = (pos: { x: number; y: number }, g: string, size = 22) => {
    c.font = `${size}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(g, pos.x * TILE + TILE / 2, pos.y * TILE + TILE / 2 + 1);
    c.textAlign = 'start';
    c.textBaseline = 'alphabetic';
  };

  glyph(world.exit, '🚪');
  if (!world.hasTreasure) glyph(world.treasure, '💎');

  // guard: colored disc tinted by its state + a facing tick
  const g = world.guard;
  c.fillStyle = stateColor(world.state);
  c.beginPath();
  c.arc(g.x * TILE + TILE / 2, g.y * TILE + TILE / 2, TILE * 0.34, 0, Math.PI * 2);
  c.fill();
  glyph(g, '🛡️', 16);
  c.strokeStyle = '#0a0d12';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(g.x * TILE + TILE / 2, g.y * TILE + TILE / 2);
  c.lineTo(g.x * TILE + TILE / 2 + world.facing.x * TILE * 0.42, g.y * TILE + TILE / 2 + world.facing.y * TILE * 0.42);
  c.stroke();
  c.lineWidth = 1;

  glyph(world.player, '🥷');

  // hearts
  c.textAlign = 'left';
  c.fillStyle = '#f85149';
  c.font = '15px sans-serif';
  c.fillText('❤'.repeat(Math.max(0, world.playerHp)), 8, 17);
  c.textAlign = 'start';
}

export default function DungeonGuardian({ actor }: { actor: ActorMeta }) {
  const { snapshot, log, start, send } = useAgentSession(actor);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const world = (snapshot?.context as { world?: GameWorld } | undefined)?.world ?? null;

  // auto-start a game session on mount
  useEffect(() => {
    start();
  }, [start]);

  // keyboard input → server events
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        send({ type: 'SHOVE' });
        return;
      }
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      send({ type: 'MOVE', dir, sneak: e.shiftKey });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send]);

  // redraw whenever the world changes
  useEffect(() => {
    if (canvasRef.current && world) draw(canvasRef.current, world);
  }, [world]);

  return (
    <>
      <div className="col left">
        <div className="card">
          <h2>{actor.pattern} <span className="tag">server-authoritative · WebSocket</span></h2>
          <div style={{ fontSize: 15, fontWeight: 600 }}>🛡️ Dungeon Guardian</div>
          <div className="muted" style={{ fontSize: 13 }}>
            You're the thief 🥷. Grab the 💎 and reach the 🚪. The guard is a state machine running on the server.
          </div>
        </div>
        <canvas ref={canvasRef} />
        <div className="card">
          <div className="muted" style={{ fontSize: 12 }}>
            <b>Move:</b> Arrows / WASD · <b>Sneak (silent):</b> hold Shift · <b>Shove guard:</b> Space (when adjacent)
          </div>
          <div className="legend">
            <span><i style={{ background: '#f0883e55', border: '1px solid #f0883e' }} /> vision cone (perception)</span>
            <span><i style={{ background: '#a371f7' }} /> last known position (memory)</span>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" onClick={() => start()}>↺ New game</button>
          </div>
        </div>
      </div>

      <div className="col right">
        {world && <StatePanel value={world.state} />}
        {world && (
          <div className="card">
            <h2>Guard's thought</h2>
            <div className="thought">“{world.thought}”</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              alert: {world.alert} · guard hp: {world.guardHp} · search: {world.searchTimer}
            </div>
          </div>
        )}

        {world?.awaitingOperator && (
          <div className="card hil">
            <h2>🧑‍✈️ Human-in-the-loop</h2>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              The guard is wounded and requests permission to retreat for reinforcements. Approve?
            </div>
            <div className="row">
              <button className="good" onClick={() => send({ type: 'APPROVE' })}>✔ Approve retreat</button>
              <button className="bad" onClick={() => send({ type: 'DENY' })}>✘ Deny (keep fighting)</button>
            </div>
          </div>
        )}

        <TransitionLog log={log} />
      </div>

      {world?.over && (
        <div className="overlay">
          <div className="box">
            <h2>{world.over === 'win' ? '🎉 Escaped!' : '💀 Caught!'}</h2>
            <p className="muted">
              {world.over === 'win'
                ? 'You slipped past the state machine — broke its line of sight, exploited its memory gaps, and reached the exit.'
                : "The guard's chase → attack transition got you. Sneak (Shift) and break line of sight to force it into search."}
            </p>
            <button className="primary" onClick={() => start()}>Play again</button>
          </div>
        </div>
      )}
    </>
  );
}
