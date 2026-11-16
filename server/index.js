// Starts the API server.
//
//   npm start      -> http://localhost:3001
//
// The React client (Vite) runs separately during development and proxies
// /api to this server. If a production build exists in dist/ it is served
// from here too.
import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db.js';
import { createFootballApi } from './api.js';
import { createRouter } from './routes.js';

const PORT = Number(process.env.PORT) || 3001;
const API_KEY = process.env.FOOTBALL_API_KEY?.trim();

const db = openDb(process.env.DB_FILE);
const api = createFootballApi({ apiKey: API_KEY, db });
api.hasApiKey = Boolean(API_KEY);

const app = express();

// Tiny request log so you can see what the client is asking for.
app.use('/api', (req, res, next) => {
  console.log(`${req.method} /api${req.url}`);
  next();
});

app.use('/api', createRouter({ api, db }));

// Serve the built client (npm run build) when it exists.
const distDir = path.join(import.meta.dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// One place that turns errors into readable JSON for the frontend.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: err.code || 'server_error',
    message: err.message || 'Something went wrong on the server.',
    ...(err.retryAfterMs ? { retryAfterSeconds: Math.ceil(err.retryAfterMs / 1000) } : {}),
  });
});

app.listen(PORT, () => {
  console.log(`Football stats API on http://localhost:${PORT}`);
  if (!API_KEY) {
    console.warn(
      'FOOTBALL_API_KEY is not set. Copy .env.example to .env, add your key and restart.'
    );
  }
});
