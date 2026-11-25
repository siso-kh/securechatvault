import http from './http';

export const listPolicies = async () => (await http.get('/policies')).data.policies;
export const createPolicy = async (body) => (await http.post('/policies', body)).data.policy;
export const updatePolicy = async (id, body) => (await http.put(`/policies/${id}`, body)).data.policy;
export const setPolicyEnabled = async (id, enabled) =>
  (await http.patch(`/policies/${id}/enabled`, { enabled })).data.policy;
export const deletePolicy = (id) => http.delete(`/policies/${id}`);