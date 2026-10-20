import type { AnyStateMachine } from 'xstate';
import type { ActorMeta } from '@automata/shared';
import menuPlanner from './machines/writer';
import nutritionist from './machines/critic';
import recipeRefiner from './machines/reflection';
import dietaryGate from './machines/human-in-the-loop';
import sousChef from './machines/writer-chat';
import kitchenOrchestrator from './machines/collaboration';
import ovenTimer from './machines/oven-timer';
import dungeonGuardian from './machines/dungeon-guardian';

export type ActorEntry = { machine: AnyStateMachine; meta: ActorMeta };

/**
 * The actor registry — the "Mise" meal-prep kitchen. Each key is a URL segment:
 * /api/agents/:name. Every station is its own addressable HTTP resource, and
 * each one demonstrates a different agentic state-machine pattern (see EXERCISES.md).
 */
export const registry: Record<string, ActorEntry> = {
  'menu-planner': {
    machine: menuPlanner,
    meta: {
      name: 'menu-planner',
      id: 'Menu Planner',
      description: 'Plans a dish, but first calls the pantry tool to see which ingredients are in stock.',
      pattern: 'Tool use',
      isGame: false,
      chat: false,
      defaultInput: { threadMessages: [{ role: 'user', content: 'Plan a quick dinner recipe' }] },
    },
  },
  nutritionist: {
    machine: nutritionist,
    meta: {
      name: 'nutritionist',
      id: 'Nutritionist',
      description: 'Reviews a recipe and suggests healthier ingredient swaps.',
      pattern: 'Single-step LLM',
      isGame: false,
      chat: false,
      defaultInput: { threadMessages: [{ role: 'assistant', content: 'To make tacos, fill the tortillas with tomatoes, cheese, and grated carrots.' }] },
    },
  },
  'recipe-refiner': {
    machine: recipeRefiner,
    meta: {
      name: 'recipe-refiner',
      id: 'Recipe Refiner',
      description: 'The menu planner and nutritionist pass a recipe back and forth to make it healthier.',
      pattern: 'Reflection',
      isGame: false,
      chat: false,
      defaultInput: { dish: 'Tacos' },
    },
  },
  'kitchen-orchestrator': {
    machine: kitchenOrchestrator,
    meta: {
      name: 'kitchen-orchestrator',
      id: 'Kitchen Orchestrator',
      description: 'A head chef routes work to specialist stations (recipe → procure → prep → feedback → done), then a summarizer presents the meal.',
      pattern: 'Orchestration / routing',
      isGame: false,
      chat: false,
      defaultInput: { threadMessages: [{ role: 'user', content: 'Deliver tacos to the customer' }] },
    },
  },
  'dietary-gate': {
    machine: dietaryGate,
    meta: {
      name: 'dietary-gate',
      id: 'Dietary Gate',
      description: 'Before checking the pantry for a possible allergen, the kitchen pauses and waits for an operator to Approve or Deny.',
      pattern: 'Human-in-the-loop',
      isGame: false,
      chat: true,
      defaultInput: { threadMessages: [{ role: 'user', content: 'Write a recipe for tacos' }] },
    },
  },
  'sous-chef': {
    machine: sousChef,
    meta: {
      name: 'sous-chef',
      id: 'Sous-Chef',
      description: 'Interactive chat: ask for a dish, tweak it, approve/deny pantry access. Stays alive between turns.',
      pattern: 'Interactive agent',
      isGame: false,
      chat: true,
    },
  },
  'oven-timer': {
    machine: ovenTimer,
    meta: {
      name: 'oven-timer',
      id: 'Oven Timer',
      description: 'A pure finite state machine with NO LLM: cooking → ready → burnt, on delayed transitions. Plate it in the window or it burns.',
      pattern: 'Pure FSM (no LLM)',
      isGame: false,
      chat: false,
      events: [{ type: 'PLATE', label: '🍽️ Plate it' }],
      defaultInput: { dish: 'Roast chicken' },
    },
  },
  'dungeon-guardian': {
    machine: dungeonGuardian,
    meta: {
      name: 'dungeon-guardian',
      id: 'Dungeon Guardian',
      description: 'Bonus game: a guard NPC as a state machine (patrol → chase → search → attack) with a human-in-the-loop backup call.',
      pattern: 'Game / autonomous loop',
      isGame: true,
      chat: false,
    },
  },
};
