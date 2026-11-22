import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export default function Composer({ onSend, disabled = false, autoFocus = true }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 focus-within:border-faint">
      <textarea
        ref={inputRef}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask anything…"
        aria-label="Message"
        className="max-h-40 flex-1 resize-none border-0 bg-transparent text-sm outline-none placeholder:text-faint"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !text.trim()}
        aria-label="Send message"
        className="grid size-8 shrink-0 place-items-center rounded-full border-0 bg-crimson text-ink transition-colors hover:bg-crimson-hover disabled:opacity-50"
      >
        <ArrowUp size={16} />
      </button>
    </div>
  );
}