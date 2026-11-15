// tests/setup.js
const os = require('os');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

jest.setTimeout(30000); // first run of mongo-memory-server can be slow

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();

  // The mongodb driver (v7) resolves its `os` adapter with a dynamic import().
  // Jest's CommonJS VM rejects that with "A dynamic import callback was invoked
  // without --experimental-vm-modules". The driver swallows the rejection and
  // sends empty client metadata, which mongod refuses with "Missing required
  // sub-document 'driver'", so mongoose.connect() hangs until it times out.
  // Passing the adapter explicitly skips the dynamic import path entirely.
  await mongoose.connect(mongo.getUri(), {
    runtimeAdapters: { os },
    serverSelectionTimeoutMS: 10000,
  });

  // Make sure indexes (e.g. the unique email index) exist before any request runs.
  await Promise.all(
    mongoose.modelNames().map((name) => mongoose.model(name).init())
  );
}, 60000);

afterEach(async () => {
  if (mongoose.connection.readyState !== 1) return;
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
