// ecosystem.config.js
// PM2 ecosystem configuration for myquota-backend production deployment.
// Run: pm2 start ecosystem.config.js --env production

module.exports = {
  apps: [
    {
      name: 'myquota-backend',
      script: 'dist/index.js',

      // ── Instances & mode ──────────────────────────────────────────────────
      // Using fork mode (single instance) for stateful connections.
      // Scale horizontally by running multiple VPS instances behind a load balancer.
      instances: 1,
      exec_mode: 'fork',

      // ── Resource limits ───────────────────────────────────────────────────
      max_memory_restart: '800M',

      // ── Restart policy ────────────────────────────────────────────────────
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',

      // ── Environment ───────────────────────────────────────────────────────
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        USE_SUPABASE: 'true',
      },
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        USE_SUPABASE: 'false',
      },

      // ── Logging ──────────────────────────────────────────────────────────
      error_file: '/opt/myquota-backend/logs/err.log',
      out_file: '/opt/myquota-backend/logs/out.log',
      log_file: '/opt/myquota-backend/logs/combined.log',
      time: true,

      // ── Graceful shutdown ────────────────────────────────────────────────
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};