import http from './http';

export const listUsers = async ({ search = '', limit = 100 } = {}) =>
  (await http.get('/users', { params: { search, limit } })).data; // { users, total }

export const setUserRole = async (id, role) =>
  (await http.patch(`/users/${id}/role`, { role })).data.user;

export const setUserBanned = async (id, isBanned) =>
  (await http.patch(`/users/${id}/ban`, { isBanned })).data.user;

export const deleteUser = (id) => http.delete(`/users/${id}`);
