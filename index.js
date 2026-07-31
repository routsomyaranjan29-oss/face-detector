const { onRequest } = require('firebase-functions/v2/https');
const { app, initDatabase } = require('./server');

// Ensure database initialization on serverless warm starts
let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) {
    try {
      await initDatabase();
      dbInitialized = true;
    } catch (err) {
      console.error('Firebase Cloud Function DB initialization error:', err);
    }
  }
}

exports.api = onRequest({ cors: true, timeoutSeconds: 60, memory: '512MiB' }, async (req, res) => {
  await ensureDb();
  return app(req, res);
});
