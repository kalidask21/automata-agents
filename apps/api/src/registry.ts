import type { AnyStateMachine } from 'xstate';
import type { ActorMeta } from '@automata/shared';
import writer from './machines/writer';
import writerChat from './machines/writer-chat';
import critic from './machines/critic';
import reflection from './machines/reflection';
import humanInTheLoop from './machines/human-in-the-loop';
import collaboration from './machines/collaboration';
import dungeonGuardian from './machines/dungeon-guardian';

export type ActorEntry = { machine: AnyStateMachine; meta: ActorMeta };

/**
 * The actor registry. Each key is a URL segment: /api/agents/:name. This is what
 * makes every state machine its own addressable HTTP resource.
 */
export const registry: Record<string, ActorEntry> = {
  writer: {
    machine: writer,
    meta: {
      name: 'writer',
      id: 'Writer',
      description: 'Writes a recipe, but first calls a tool (get_inventory) to learn what ingredients exist.',
      pattern: 'Tool use',
      isGame: false,
      chat: false,
      defaultInput: { threadMessages: [{ role: 'user', content: 'Write a recipe for tacos' }] },
    },
  },
  reflection: {
    machine: reflection,
    meta: {
      name: 'reflection',
      id: 'Reflection',
      description: 'A writer and a critic pass a recipe back and forth to refine it.',
      pattern: 'Reflection',
      isGame: false,
      chat: false,
      defaultInput: { dish: 'Tacos' },
    },
  },
  critic: {
    machine: critic,
    meta: {
      name: 'critic',
      id: 'Critic',
      description: 'Reviews a recipe and suggests healthier ingredient swaps.',
      pattern: 'Single-step LLM',
      isGame: false,
      chat: false,
      defaultInput: { threadMessages: [{ role: 'assistant', content: 'To make tacos, fill the tortillas with tomatoes, cheese, and grated carrots.' }] },
    },
  },
  'human-in-the-loop': {
    machine: humanInTheLoop,
    meta: {
      name: 'human-in-the-loop',
      id: 'Human-in-the-Loop',
      description: 'The writer wants to use a tool but parks and waits for an operator to Approve or Deny.',
      pattern: 'Human-in-the-loop',
      isGame: false,
      chat: true,
      defaultInput: { threadMessages: [{ role: 'user', content: 'Write a recipe for tacos' }] },
    },
  },
  'writer-chat': {
    machine: writerChat,
    meta: {
      name: 'writer-chat',
      id: 'Writer Chat',
      description: 'Interactive chat: send messages, approve/deny tool use. Stays alive between turns.',
      pattern: 'Interactive agent',
      isGame: false,
      chat: true,
    },
  },
  collaboration: {
    machine: collaboration,
    meta: {
      name: 'collaboration',
      id: 'Collaboration',
      description: 'A planner orchestrates specialist agents (recipe → procure → prep → feedback → done), then a summarizer pitches the result.',
      pattern: 'Orchestration / routing',
      isGame: false,
      chat: false,
      defaultInput: { threadMessages: [{ role: 'user', content: 'Deliver tacos to the customer' }] },
    },
  },
  'dungeon-guardian': {
    machine: dungeonGuardian,
    meta: {
      name: 'dungeon-guardian',
      id: 'Dungeon Guardian',
      description: 'The playable game. A guard NPC is a state machine: patrol → chase → search → attack, with a human-in-the-loop backup call.',
      pattern: 'Game / autonomous loop',
      isGame: true,
      chat: false,
    },
  },
};
