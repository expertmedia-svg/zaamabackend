const appDir = process.env.ZAAMA_APP_DIR || "/home/debian/apps/zaama";
const envFile =
  process.env.ZAAMA_ENV_FILE || "/home/debian/.config/zaama/zaama-api.env";

module.exports = {
  apps: [
    {
      name: "zaama-api",
      cwd: appDir,
      script: "services/api/dist/main.js",
      interpreter: "node",
      node_args: `--env-file=${envFile}`,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "350M",
      time: true,
      merge_logs: true,
      env_production: {
        NODE_ENV: "production",
        APP_ENV: "production",
      },
    },
  ],
};
