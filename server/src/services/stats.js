import http from './http';

export const getMyReport = async () => (await http.get('/stats/me')).data;