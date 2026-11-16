const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = require('./app');
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => console.log(`Redactor on :${PORT}`));

server.on('error', (err) => {
  console.error('Server failed to start:', err.message);
  process.exit(1);
});
