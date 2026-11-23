import { useCallback, useReducer, useRef } from 'react';
import { chatReducer, initialState } from './chatReducer';
import { send as sendMessage } from '../services/chat';
import { getConversation } from '../services/conversations';
import { BlockedError } from '../services/errors';

export default function useChat() {
  const [state, dispatch] = useReducer(chatReducer, initialState);

  // Latest state for stable callbacks
  const stateRef = useRef(state);
  stateRef.current = state;

  const send = useCallback(async (text) => {
    dispatch({ type: 'SEND_START' });
    try {
      const { user, assistant, conversationId } = await sendMessage({
        history: stateRef.current.messages,
        text,
        conversationId: stateRef.current.conversationId,
      });
      dispatch({ type: 'SEND_SUCCESS', user, assistant, conversationId });
      return true;
    } catch (err) {
      if (err instanceof BlockedError) {
        dispatch({ type: 'SEND_BLOCKED', message: err.message, rule: err.rule.name });
      } else {
        dispatch({ type: 'SEND_FAILED', message: err.message || 'Something went wrong. Try again.' });
      }
      return false;
    }
  }, []);

  const load = useCallback(async (id) => {
    dispatch({ type: 'LOAD_START' });
    try {
      const conv = await getConversation(id);
      dispatch({
        type: 'LOAD_SUCCESS',
        conversationId: conv._id,
        messages: conv.messages.map(({ role, content, createdAt }, i) => ({
          id: `${conv._id}-${i}`,
          role,
          content,
          createdAt,
        })),
      });
    } catch (err) {
      const notFound = err.response?.status === 404 || err.response?.status === 400;
      dispatch({
        type: 'LOAD_FAILED',
        message: notFound ? 'This conversation no longer exists.' : 'Could not load the conversation.',
      });
    }
  }, []);

  return { ...state, send, load };
}