const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function login({ email, password }) {
  await wait(400);
  if (password.length < 8) throw new Error('Wrong email or password.');
  const role = email.toLowerCase().includes('admin') ? 'admin' : 'user';
  return { token: 'mock-jwt', user: { name: email.split('@')[0], email, role } };
}

export async function register({ name, email, password }) {
  await wait(400);
  return { token: 'mock-jwt', user: { name, email, role: 'user' } };
}