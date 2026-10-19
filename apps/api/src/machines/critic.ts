import { assign, setup, fromPromise } from 'xstate';
import { openai, MODEL } from '../llm';
import type { ChatMessage } from './types';

/**
 * CRITIC — reviews a recipe and suggests healthier changes. Used as a sub-actor
 * by the reflection pattern. Single step: critiquing_recipe → done.
 */
const machine = setup({
  types: {
    input: {} as { threadMessages: ChatMessage[] },
    context: {} as { threadMessages: ChatMessage[] },
    output: {} as ChatMessage,
  },
  actors: {
    recipe_critic: fromPromise<ChatMessage, { threadMessages: ChatMessage[] }>(async ({ input }) => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: input.threadMessages as never,
      });
      return completion.choices[0].message as unknown as ChatMessage;
    }),
  },
  actions: {
    add_assistant_message: assign({
      threadMessages: ({ event, context }) => [...context.threadMessages, (event as any).output],
    }),
  },
}).createMachine({
  id: 'Critic (Recipe)',
  initial: 'critiquing_recipe',
  context: ({ input }) => ({
    threadMessages: [
      {
        role: 'system',
        content:
          "You are a health food nut. Provide specific feedback on ingredients to remove that will make the provided recipe more healthy. Feedback should be a single sentence. Begin response with 'Nutritionist (Implement this feedback if possible!):'.",
      },
      ...input.threadMessages,
    ],
  }),
  states: {
    critiquing_recipe: {
      invoke: {
        id: 'recipe_critic',
        src: 'recipe_critic',
        input: ({ context }) => ({ threadMessages: context.threadMessages }),
        onDone: { target: 'done', actions: 'add_assistant_message' },
      },
    },
    done: { type: 'final' },
  },
  // Fixed from the original (which read a non-existent `messages` field).
  output: ({ context }) => context.threadMessages[context.threadMessages.length - 1],
});

export default machine;
