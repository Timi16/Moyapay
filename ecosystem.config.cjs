// pm2 process file: the API and the watcher worker (one codebase, two processes).
// moyapay-web is the Next.js app (apps/web, after `pnpm --filter @moyapay/web build`); it
// proxies /api/v1 to the API on 127.0.0.1:4200. Skip it if the web app is hosted elsewhere.
//   pm2 start ecosystem.config.cjs && pm2 save
//   pm2 reload ecosystem.config.cjs --update-env     (after a deploy)
// Both read the repo-root .env through Node's --env-file.
const path = require("node:path");

const common = {
  cwd: path.join(__dirname, "apps/api"),
  node_args: "--max-old-space-size=192 --env-file=../../.env",
  // Live updates reach every API instance through Postgres NOTIFY, so more API instances are
  // safe. Run exactly ONE worker: it holds one Horizon stream per merchant destination.
  exec_mode: "fork",
  instances: 1,
  autorestart: true,
  max_memory_restart: "256M",
  exp_backoff_restart_delay: 1000,
  env: { NODE_ENV: "production" },
  time: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: "moyapay-api",
      script: "dist/server.js",
      // SIGTERM -> stop accepting, close SSE streams, wait up to 10 s, disconnect.
      kill_timeout: 15000,
    },
    {
      ...common,
      name: "moyapay-worker",
      script: "dist/worker.js",
      // SIGTERM -> close the Horizon streams after the payment being processed, then exit.
      // On restart every stream resumes from its saved cursor.
      kill_timeout: 30000,
    },
    {
      name: "moyapay-web",
      cwd: path.join(__dirname, "apps/web"),
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3100 --hostname 127.0.0.1",
      env: { NODE_ENV: "production", API_ORIGIN: "http://127.0.0.1:4200" },
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "384M",
      time: true,
    },
  ],
};
