import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createConfig } from './config.js';
import { createRouter } from './routes.js';
import { createSupabaseAdmin } from './supabase.js';

const config = createConfig();
const app = express();

app.locals.supabase = createSupabaseAdmin(config);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.frontendOrigins.includes(origin)) callback(null, true);
      else callback(new Error(`Origin not allowed: ${origin}`));
    },
    credentials: false,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(createRouter(config));

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: error.message || 'Unexpected server error',
  });
});

app.listen(config.port, () => {
  console.log(`Satisfactory Map Connector API listening on ${config.port}`);
});
