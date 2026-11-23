import http from './http';

export const listConversations = async () =>
  (await http.get('/conversations')).data.conversations;

export const getConversation = async (id) =>
  (await http.get(`/conversations/${id}`)).data.conversation;

export const renameConversation = async (id, title) =>
  (await http.put(`/conversations/${id}`, { title })).data.conversation;

export const deleteConversation = (id) => http.delete(`/conversations/${id}`);