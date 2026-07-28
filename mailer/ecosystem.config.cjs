module.exports = {
  apps: [{
    name: 'tvza-mailer',
    script: './worker.js',
    cwd: __dirname,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    time: true,
  }],
};
