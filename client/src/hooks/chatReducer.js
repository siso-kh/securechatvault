export const initialState = {
  conversationId: null,
  messages: [],
  loading: false,
  error: null,
};

export function chatReducer(state, action) {
  switch (action.type) {
    case 'SEND_START':
      return { ...state, loading: true, error: null };
    case 'SEND_SUCCESS':
      return {
        ...state,
        loading: false,
        conversationId: action.conversationId ?? state.conversationId,
        messages: [...state.messages, action.user, action.assistant],
      };
    case 'SEND_BLOCKED':
      return { ...state, loading: false, error: { message: action.message, rule: action.rule } };
    case 'SEND_FAILED':
      return { ...state, loading: false, error: { message: action.message } };
    case 'LOAD_START':
      return { ...initialState, loading: true };
    case 'LOAD_SUCCESS':
      return { ...initialState, conversationId: action.conversationId, messages: action.messages };
    case 'LOAD_FAILED':
      return { ...initialState, error: { message: action.message } };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}