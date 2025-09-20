module.exports = {
  apps: [
    {
      name: "discord-sabot",
      script: "bot.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      node_args: "--optimize_for_size --max_old_space_size=256",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
