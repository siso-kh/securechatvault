import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listConversations, deleteConversation } from '../../services/conversations';

const fmt = (d) =>
  new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function HistoryPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listConversations().then(setItems).catch(() => setError('Could not load your conversations.'));
  }, []);

  const remove = async (c) => {
    if (!window.confirm(`Delete "${c.title}"? This cannot be undone.`)) return;
    try {
      await deleteConversation(c._id);
      setItems((list) => list.filter((x) => x._id !== c._id));
    } catch {
      setError('Could not delete the conversation.');
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl">History</h1>

      {error && <p role="alert" className="mt-4 text-xs text-danger">{error}</p>}

      <div className="mt-6 rounded-lg border border-line bg-bg/90 px-5 py-2">
        {items === null && !error && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
        {items?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">No conversations yet. Start one with the + button.</p>
        )}
        <ul className="m-0 list-none p-0">
          {items?.map((c) => (
            <li key={c._id} className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0">
              <Link to={`/chat/${c._id}`} className="min-w-0 flex-1 text-sm text-ink no-underline hover:underline">
                <span className="block truncate">{c.title}</span>
                <span className="text-xs text-muted">{fmt(c.updatedAt)}</span>
              </Link>
              <button
                onClick={() => remove(c)}
                className="border-0 bg-transparent text-xs text-muted hover:text-danger"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}