import { assign, setup, fromPromise, emit } from 'xstate';
import { openai, MODEL } from '../llm';
import type { ChatMessage } from './types';

/**
 * WRITER CHAT — an interactive, long-running variant of the writer. It sits in
 * `idle` waiting for USER_MESSAGE, writes, and asks for approval before using a
 * tool (a lightweight human-in-the-loop). Great for the SPA's chat playground.
 */
const machine = setup({
  types: {
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
    add_tool_deny: assign({
      messages: ({ context }) => {
        const last = context.messages[context.messages.length - 1] as any;
        return [...context.messages, { role: 'tool', content: 'Request denied.', tool_call_id: last.tool_calls[0].id }];
      },
    }),
    emit_client_message: emit(({ event }) => ({ type: 'CLIENT_MESSAGE', data: (event as any).output?.content ?? '' })),
    notify_admin: emit(() => ({ type: 'ADMIN_MESSAGE', data: 'Tool use approval required. Send `approve` or `deny`.' })),
    notify_user: emit(() => ({ type: 'CLIENT_MESSAGE', data: 'Please wait while I get approval...' })),
    notify_user_approved: emit(() => ({ type: 'CLIENT_MESSAGE', data: 'Got approval to continue...' })),
  },
  guards: {
    is_tool_call: ({ event }) => (event as any).output?.tool_calls != null,
    is_approval_message: ({ event }) => (event as any).payload === 'approve',
  },
}).createMachine({
  id: 'Writer Chat',
  initial: 'idle',
  context: () => ({
    messages: [
      {
        role: 'system',
        content:
          'You are a recipe writer that responds to feedback. Recipes are a single sentence. Begin by using the available tools to gather required information. Do not include any ingredients in the recipe that are not available in the inventory.',
      },
    ],
  }),
  states: {
    idle: {
      on: { USER_MESSAGE: { actions: 'add_user_message', target: 'writing' } },
    },
    writing: {
      invoke: {
        id: 'recipe_author',
        src: 'recipe_author',
        input: ({ context }) => ({ messages: context.messages }),
        onDone: [
          { guard: 'is_tool_call', target: 'approval_required', actions: ['add_assistant_message'] },
          { target: 'idle', actions: ['add_assistant_message', 'emit_client_message'] },
        ],
      },
    },
    approval_required: {
      entry: ['notify_admin', 'notify_user'],
      on: {
        USER_MESSAGE: [
          { target: 'using_tool', actions: 'notify_user_approved', guard: 'is_approval_message' },
          { target: 'writing', actions: ['add_tool_deny'] },
        ],
      },
    },
    using_tool: {
      invoke: {
        id: 'get_inventory',
        src: 'get_inventory',
        onDone: { target: 'writing', actions: ['add_tool_response'] },
      },
    },
  },
});

export default machine;
