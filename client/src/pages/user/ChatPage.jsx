import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import useChat from '../../hooks/useChat';
import MessageList from '../../components/chat/MessageList';
import Composer from '../../components/chat/Composer';
import BlockedNotice from '../../components/chat/BlockedNotice';

export default function ChatPage() {
  const { id } = useParams();
  const { conversationId, messages, loading, error, send, load } = useChat();
  const location = useLocation();
  const navigate = useNavigate();
  const startedRef = useRef(false);

  // 1. Reopen a saved conversation
  useEffect(() => {
    if (id && id !== conversationId) load(id);
  }, [id, conversationId, load]);

  // 2. First message typed on Home arrives through router state
  useEffect(() => {
    const first = location.state?.firstMessage;
    if (first && !startedRef.current) {
      startedRef.current = true;
      send(first);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate, send]);

  // 3. After the first reply, put the new id in the URL
  useEffect(() => {
    if (conversationId && !id) navigate(`/chat/${conversationId}`, { replace: true });
  }, [conversationId, id, navigate]);

  return (
    <div className="flex h-full flex-col">
      <MessageList messages={messages} loading={loading} />
      <div className="mx-auto w-full max-w-3xl px-6 pb-6">
        <Composer onSend={send} disabled={loading} autoFocus />
        {error && <BlockedNotice error={error} />}
      </div>
    </div>
  );
}