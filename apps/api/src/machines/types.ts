/**
 * A loose chat-message shape. LLM message arrays are inherently dynamic
 * (assistant/tool/user roles, optional tool_calls), so we keep this permissive
 * and let the OpenAI SDK boundary accept it via a narrow cast.
 */
export type ChatMessage = {
  role: string;
  content?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool_calls?: any[];
  tool_call_id?: string;
  [key: string]: unknown;
};
