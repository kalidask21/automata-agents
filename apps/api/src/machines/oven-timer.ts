import { setup, assign, emit } from 'xstate';

/**
 * OVEN TIMER — a pure finite state machine with NO LLM at all.
 *
 * This is the point of the whole project made obvious: the state machine is the
 * backbone; the LLM is optional. The dish cooks on delayed (`after`) transitions:
 *   cooking --(4s)--> ready --(4s)--> burnt
 * …and `ready --PLATE--> plated`. Plate it in the window or it burns.
 */
const COOK_MS = 4000;
const READY_MS = 4000;

type Ctx = { dish: string; result: 'cooking' | 'plated' | 'burnt' };

const machine = setup({
  types: {
    input: {} as { dish?: string },
    context: {} as Ctx,
    output: {} as { dish: string; result: 'plated' | 'burnt' },
  },
  actions: {
    announceCooking: emit(({ context }) => ({ type: 'SYSTEM_MESSAGE', data: `🔥 The ${context.dish} is in the oven...` })),
    announceReady: emit(({ context }) => ({ type: 'CLIENT_MESSAGE', data: `✅ The ${context.dish} is ready — plate it before it burns!` })),
    markPlated: assign({ result: () => 'plated' as const }),
    announcePlated: emit(({ context }) => ({ type: 'CLIENT_MESSAGE', data: `🍽️ Plated the ${context.dish}. Perfect timing!` })),
    markBurnt: assign({ result: () => 'burnt' as const }),
    announceBurnt: emit(({ context }) => ({ type: 'SYSTEM_MESSAGE', data: `💀 You left the ${context.dish} too long — it's burnt!` })),
  },
}).createMachine({
  id: 'Oven Timer',
  initial: 'cooking',
  context: ({ input }) => ({ dish: input?.dish || 'Roast chicken', result: 'cooking' }),
  states: {
    cooking: {
      entry: 'announceCooking',
      after: { [COOK_MS]: { target: 'ready' } },
    },
    ready: {
      entry: 'announceReady',
      after: { [READY_MS]: { target: 'burnt' } },
      on: { PLATE: { target: 'plated' } },
    },
    plated: { entry: ['markPlated', 'announcePlated'], type: 'final' },
    burnt: { entry: ['markBurnt', 'announceBurnt'], type: 'final' },
  },
  output: ({ context }) => ({ dish: context.dish, result: context.result === 'plated' ? 'plated' : 'burnt' }),
});

export default machine;
