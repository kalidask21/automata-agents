import { assign, setup } from 'xstate';
import writerAgent from './writer';
import criticAgent from './critic';
import type { ChatMessage } from './types';

/**
 * REFLECTION — a writer and a critic pass a recipe back and forth. The writer
 * drafts, the critic critiques, the writer revises. A loopCount guard bounds the
 * number of refinement rounds (writing → critiquing → writing → … → done).
 */
const machine = setup({
  types: {
    input: {} as { dish: string },
    context: {} as {
      messages: ChatMessage[];
      loopCount: number;
      maxLoopCount: number;
    },
  },
  actions: {
    addMessage: assign({ messages: ({ event, context }) => [...context.messages, (event as any).output] }),
  },
  actors: {
    writerAgent,
    criticAgent,
  },
}).createMachine({
  id: 'Reflection (Recipe)',
  initial: 'writing',
  context: ({ input }) => ({
    messages: [{ role: 'user', content: `Write a recipe for the dish: ${input.dish}` }],
    loopCount: 0,
    maxLoopCount: 1,
  }),
  states: {
    writing: {
      invoke: {
        id: 'writerAgent',
        src: 'writerAgent',
        input: ({ context }) => ({ threadMessages: context.messages }),
        onDone: { target: 'critiquing', actions: 'addMessage' },
      },
    },
    critiquing: {
      invoke: {
        id: 'criticAgent',
        src: 'criticAgent',
        input: ({ context }) => ({ threadMessages: [context.messages[context.messages.length - 1]] }),
        onDone: [
          {
            target: 'writing',
            actions: assign({
              loopCount: ({ context }) => context.loopCount + 1,
              messages: ({ context, event }) => [...context.messages, (event as any).output],
            }),
            guard: ({ context }) => context.loopCount < context.maxLoopCount,
          },
          { target: 'done' },
        ],
      },
    },
    done: { type: 'final' },
  },
  output: ({ context }) => (context.messages[context.messages.length - 1] as any).content,
});

export default machine;
