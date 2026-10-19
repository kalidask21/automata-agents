import { assign, setup, fromPromise, createActor, toPromise } from 'xstate';
import writerAgent from './writer';
import { openai, MODEL } from '../llm';
import type { ChatMessage } from './types';

/**
 * COLLABORATION / ORCHESTRATION — a "traffic cop" planning agent repeatedly
 * decides which specialist to run next (write recipe → procure → prep → feedback
 * → done) by calling tools, then a summarizer pitches the result. The recipe
 * specialist is the Writer machine, invoked as a sub-actor.
 */
const DELAY = 1200;

type Ctx = {
  threadMessages: ChatMessage[];
  recipe: string;
  procurement: string;
  meal_prep: string;
  feedback: string;
  summary: string;
};

const planTools = [
  { type: 'function' as const, function: { name: 'recipeAgent', description: 'Create a new recipe.', parameters: { type: 'object', properties: { dish: { type: 'string', description: 'The dish to create a recipe for' } } } } },
  { type: 'function' as const, function: { name: 'procurementAgent', description: 'Acquire all ingredients necessary for a recipe.' } },
  { type: 'function' as const, function: { name: 'mealPrepAgent', description: 'Execute the recipe and deliver a meal to the customer.' } },
  { type: 'function' as const, function: { name: 'humanFeedbackAgent', description: 'Get feedback from the customer about their meal' } },
  { type: 'function' as const, function: { name: 'done', description: 'Exit the flow' } },
];

const toolName = (event: any): string | undefined => event.output?.tool_calls?.[0]?.function?.name;

const fakeTool = (content: string) =>
  fromPromise<ChatMessage, { tool_call_id: string }>(async ({ input }) => {
    await new Promise((r) => setTimeout(r, DELAY));
    return { role: 'tool', content: JSON.stringify({ role: 'assistant', content }), tool_call_id: input.tool_call_id };
  });

const machine = setup({
  types: {
    input: {} as { threadMessages?: ChatMessage[] },
    context: {} as Ctx,
  },
  actors: {
    planningAgent: fromPromise<ChatMessage, { threadMessages: ChatMessage[] }>(async ({ input }) => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'Your mission is to deliver a meal to a customer by coordinating actions using the tools available. Start by creating an execution plan. Invoke each tool once, in sequence, one at a time; wait for a result before the next. Call `done` last.',
          },
          ...input.threadMessages,
        ] as never,
        tools: planTools,
      });
      await new Promise((r) => setTimeout(r, DELAY));
      return completion.choices[0].message as unknown as ChatMessage;
    }),
    summarizationAgent: fromPromise<string, Ctx>(async ({ input }) => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: 'system', content: `Pitch <Input> to the humans like your life depends on it. <Input>${JSON.stringify(input)}</Input>` }] as never,
      });
      await new Promise((r) => setTimeout(r, DELAY));
      return completion.choices[0].message.content ?? '';
    }),
    recipeAgent: fromPromise<ChatMessage, { dish: string; tool_call_id: string }>(async ({ input }) => {
      // The recipe specialist IS the Writer machine, run as a child actor.
      const actor = createActor(writerAgent, {
        input: { threadMessages: [{ role: 'user', content: `Write a recipe for ${input.dish}` }] },
      });
      actor.start();
      const output = await toPromise(actor);
      return { role: 'tool', content: JSON.stringify(output), tool_call_id: input.tool_call_id };
    }),
    procurementAgent: fakeTool('Ingredients available'),
    mealPrepAgent: fakeTool('Meal delivered'),
    humanFeedbackAgent: fakeTool('5/5'),
  },
  guards: {
    isRecipe: ({ event }) => toolName(event) === 'recipeAgent',
    isProcurement: ({ event }) => toolName(event) === 'procurementAgent',
    isMealPrep: ({ event }) => toolName(event) === 'mealPrepAgent',
    isHumanFeedback: ({ event }) => toolName(event) === 'humanFeedbackAgent',
  },
  actions: {
    add_thread_message: assign({ threadMessages: ({ event, context }) => [...context.threadMessages, (event as any).output] }),
    add_recipe: assign({ recipe: ({ event }) => JSON.stringify((event as any).output) }),
    add_procurement: assign({ procurement: ({ event }) => JSON.stringify((event as any).output) }),
    add_meal_prep: assign({ meal_prep: ({ event }) => JSON.stringify((event as any).output) }),
    add_feedback: assign({ feedback: ({ event }) => JSON.stringify((event as any).output) }),
    add_summary: assign({ summary: ({ event }) => (event as any).output }),
  },
}).createMachine({
  id: 'Orchestration (Meal Delivery)',
  context: { threadMessages: [], recipe: '', procurement: '', meal_prep: '', feedback: '', summary: '' },
  initial: 'Planning',
  states: {
    Planning: {
      invoke: {
        src: 'planningAgent',
        input: ({ context }) => ({ threadMessages: context.threadMessages }),
        onDone: [
          { target: 'Writing Recipe', actions: 'add_thread_message', guard: 'isRecipe' },
          { target: 'Preparing Meal', actions: 'add_thread_message', guard: 'isMealPrep' },
          { target: 'Procuring Ingredients', actions: 'add_thread_message', guard: 'isProcurement' },
          { target: 'Getting Feedback', actions: 'add_thread_message', guard: 'isHumanFeedback' },
          { target: 'Summarizing Result', actions: 'add_thread_message' },
        ],
      },
    },
    'Writing Recipe': {
      invoke: {
        src: 'recipeAgent',
        input: ({ event }) => {
          const call = (event as any).output.tool_calls[0];
          let dish = 'tacos';
          try {
            dish = JSON.parse(call.function.arguments || '{}').dish ?? dish;
          } catch {
            /* keep default */
          }
          return { dish, tool_call_id: call.id };
        },
        onDone: { target: 'Planning', actions: ['add_thread_message', 'add_recipe'] },
      },
    },
    'Preparing Meal': {
      invoke: { src: 'mealPrepAgent', input: ({ event }) => ({ tool_call_id: (event as any).output.tool_calls[0].id }), onDone: { target: 'Planning', actions: ['add_thread_message', 'add_meal_prep'] } },
    },
    'Procuring Ingredients': {
      invoke: { src: 'procurementAgent', input: ({ event }) => ({ tool_call_id: (event as any).output.tool_calls[0].id }), onDone: { target: 'Planning', actions: ['add_thread_message', 'add_procurement'] } },
    },
    'Getting Feedback': {
      invoke: { src: 'humanFeedbackAgent', input: ({ event }) => ({ tool_call_id: (event as any).output.tool_calls[0].id }), onDone: { target: 'Planning', actions: ['add_thread_message', 'add_feedback'] } },
    },
    'Summarizing Result': {
      invoke: { src: 'summarizationAgent', input: ({ context }) => context, onDone: { target: 'Done', actions: ['add_thread_message', 'add_summary'] } },
    },
    Done: { type: 'final' },
  },
  output: ({ context }) => context.summary,
});

export default machine;
