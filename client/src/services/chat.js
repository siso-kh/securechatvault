import http from './http';
import * as mock from './chat.mock';
import { BlockedError } from './errors';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

const humanize = (category = 'sensitive data') =>
  category.replace(/_/g, ' ').toLowerCase();


async function sendMessage({ history, text, conversationId }) {
  const messages = [
    ...history.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: text },
  ];

  try {
    const { data } = await http.post('/chat', { messages, conversationId });

    const maskedText = data.masked_messages?.at(-1)?.content ?? text;
    const reply = data.choices?.[0]?.message?.content ?? '';
    const now = new Date().toISOString();

    return {
      conversationId: data.conversation_id,
      user: { id: crypto.randomUUID(), role: 'user', content: maskedText, createdAt: now },
      assistant: { id: crypto.randomUUID(), role: 'assistant', content: reply, createdAt: now },
    };
  } catch (err) {
    const { status, data } = err.response ?? {};

    if (status === 422 && data?.code === 'CONTENT_BLOCKED') {
      const category = data.redactor_report?.detections?.[0]?.category;
      throw new BlockedError({ name: humanize(category), label: humanize(category) });
    }
    if (status === 503) {
      throw new Error('The redaction service is unavailable, so nothing was sent.');
    }
    if (status === 502) {
      throw new Error('The AI service is unavailable. Try again later.');
    }
    if (status === 401) throw err; // http.js already redirects to /login
    throw new Error(data?.error || 'Something went wrong. Try again.');
  }
}

export const send = USE_MOCK ? mock.sendMessage : sendMessage;