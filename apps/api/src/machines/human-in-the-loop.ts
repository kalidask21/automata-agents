import { assign, setup, fromPromise, emit } from 'xstate';
import { openai, MODEL } from '../llm';
import type { ChatMessage } from './types';

/**
 * HUMAN-IN-THE-LOOP — the writer wants to call a tool, but first the machine
 * parks in `approval_required` and waits for an operator to send `approve` or
 * `deny`. The FSM cannot proceed without that external event.
 */
const DELAY = 1500;

const machine = setup({
  types: {
    input: {} as { threadMessages: ChatMessage[] },
    context: {} as { messages: ChatMessage[] },
    output: {} as ChatMessage,
  },
  actors: {
    get_inventory: fromPromise<string[]>(async () => [
      'Tortillas', 'Beef', 'Beans', 'Tomatoes', 'Lettuce', 'Cheese', 'Carrots', 'Pickles', 'Bricks', 'Super Fatty Yogurt',
    ]),
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
      await new Promise((r) => setTimeout(r, DELAY));
      return completion.choices[0].message as unknown as ChatMessage;
    }),
  },
  actions: {
    add_user_message: assign({
      messages: ({ event, context }) => [...context.messages, { role: 'user', content: (event as any).payload }],
    }),
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
    remove_tool_call: assign({ messages: ({ context }) => context.messages.slice(0, -1) }),
    notify_admin: emit(() => ({ type: 'ADMIN_MESSAGE', data: 'Dietary approval required before checking the pantry (possible allergen). Send `approve` or `deny`.' })),
    notify_user: emit(() => ({ type: 'CLIENT_MESSAGE', data: 'Please wait while I get approval...' })),
    notify_user_approved: emit(() => ({ type: 'CLIENT_MESSAGE', data: 'Got approval to continue...' })),
  },
  guards: {
    is_tool_call: ({ event }) => (event as any).output.tool_calls != null,
    is_approval_message: ({ event }) => (event as any).payload === 'approve',
  },
}).createMachine({
  id: 'Dietary Gate',
  initial: 'writing',
  context: ({ input }) => ({
    messages: [
      {
        role: 'system',
        content:
          "You are a recipe writer that responds to feedback. Recipes are a single sentence. Begin by using the available tools to gather required information. Begin response with 'Writer:'. Do not include any ingredients in the recipe that are not available in the inventory. If you lack permission to use required tools then give an error message back and end.",
      },
      ...input.threadMessages,
    ],
  }),
  states: {
    writing: {
      invoke: {
        id: 'recipe_author',
        src: 'recipe_author',
        input: ({ context }) => ({ messages: context.messages }),
        onDone: [
          { guard: 'is_tool_call', target: 'approval_required', actions: ['add_assistant_message'] },
          { target: 'done', actions: ['add_assistant_message'] },
        ],
      },
    },
    approval_required: {
      entry: ['notify_admin', 'notify_user'],
      on: {
        USER_MESSAGE: [
          { target: 'using_tool', actions: 'notify_user_approved', guard: 'is_approval_message' },
          { target: 'writing', actions: ['remove_tool_call', 'add_user_message'] },
        ],
        // Convenience events for the SPA's Approve/Deny buttons.
        APPROVE: { target: 'using_tool', actions: 'notify_user_approved' },
        DENY: { target: 'writing', actions: ['remove_tool_call'] },
      },
    },
    using_tool: {
      invoke: {
        id: 'get_inventory',
        src: 'get_inventory',
        onDone: { target: 'writing', actions: 'add_tool_response' },
      },
    },
    done: { type: 'final' },
  },
  output: ({ context }) => context.messages[context.messages.length - 1],
});

export default machine;
