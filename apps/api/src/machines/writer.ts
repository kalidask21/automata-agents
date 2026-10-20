import { assign, setup, fromPromise, emit } from 'xstate';
import { openai, MODEL } from '../llm';
import type { ChatMessage } from './types';

/**
 * WRITER — the tool-use pattern.
 * The agent writes a recipe but must first call a tool (get_inventory) to learn
 * what ingredients exist. States: writing ⇄ using_tool → done.
 */
const DELAY = 1500;

const machine = setup({
  types: {
    input: {} as { threadMessages: ChatMessage[] },
    context: {} as { messages: ChatMessage[] },
    output: {} as ChatMessage,
  },
  actors: {
    get_inventory: fromPromise<string[]>(async () => {
      await new Promise((r) => setTimeout(r, DELAY));
      return ['Tortillas', 'Beef', 'Beans', 'Tomatoes', 'Lettuce', 'Cheese', 'Carrots', 'Pickles', 'Bricks', 'Super Fatty Yogurt'];
    }),
    recipe_author: fromPromise<ChatMessage, { messages: ChatMessage[] }>(async ({ input }) => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: input.messages as never,
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_inventory',
              description: 'Get the list of currently available ingredients',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
      });
      return completion.choices[0].message as unknown as ChatMessage;
    }),
  },
  actions: {
    add_assistant_message: assign({
      messages: ({ event, context }) => [...context.messages, (event as any).output],
    }),
    add_tool_response: assign({
      messages: ({ event, context }) => {
        const last = context.messages[context.messages.length - 1] as any;
        return [
          ...context.messages,
          { role: 'tool', content: JSON.stringify((event as any).output), tool_call_id: last.tool_calls[0].id },
        ];
      },
    }),
    emit_message: emit(({ context }) => ({
      type: 'SYSTEM_MESSAGE',
      data: `Available inventory: ${JSON.stringify((context.messages[context.messages.length - 1] as any).content)}`,
    })),
  },
}).createMachine({
  id: 'Menu Planner',
  initial: 'writing',
  context: ({ input }) => ({
    messages: [
      {
        role: 'system',
        content:
          "You are a kitchen menu planner and recipe writer that responds to feedback. Recipes are a single sentence. Begin by using the available tools to check the pantry. Begin response with 'Chef:'. Do not include any ingredients in the recipe that are not available in the pantry.",
      },
      ...(Array.isArray(input.threadMessages) ? input.threadMessages : []),
    ],
  }),
  states: {
    writing: {
      invoke: {
        id: 'recipe_author',
        src: 'recipe_author',
        input: ({ context }) => ({ messages: context.messages }),
        onDone: [
          {
            guard: ({ event }) => (event as any).output.tool_calls != null,
            target: 'using_tool',
            actions: ['add_assistant_message'],
          },
          { target: 'done', actions: ['add_assistant_message'] },
        ],
      },
    },
    using_tool: {
      invoke: {
        id: 'get_inventory',
        src: 'get_inventory',
        onDone: { target: 'writing', actions: ['add_tool_response', 'emit_message'] },
      },
    },
    done: { type: 'final' },
  },
  output: ({ context }) => context.messages[context.messages.length - 1],
});

export default machine;
