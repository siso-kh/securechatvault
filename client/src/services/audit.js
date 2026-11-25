import http from './http';

export const listAudit = async ({ limit = 100 } = {}) =>
  (await http.get('/audit', { params: { limit } })).data; // { logs }
