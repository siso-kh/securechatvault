import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';

export default function MessageList({ messages, loading }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <ul className="mx-auto flex max-w-3xl list-none flex-col gap-6 p-0">
        {messages.map((m, i) => (
          <MessageBubble key={m.id ?? i} message={m} />
        ))}
        {loading && (
          <li aria-live="polite" className="flex items-center gap-1 text-xs text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-faint" />
            <span className="size-1.5 animate-pulse rounded-full bg-faint [animation-delay:150ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-faint [animation-delay:300ms]" />
            <span className="ml-1">Vault is typing</span>
          </li>
        )}
      </ul>
      <div ref={endRef} />
    </div>
  );
}