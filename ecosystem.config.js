module.exports = {
  apps: [{
    name: 'toko-digital',
    script: 'src/server-production.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Logging
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    
    // Process management
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '500M',
    
    // Monitoring
    watch: false,
    ignore_watch: ['node_modules', 'logs', '*.log'],
    
    // Instance settings
    instance_var: 'INSTANCE_ID',
    
    // Advanced PM2 features
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Environment-specific settings
    node_args: '--max-old-space-size=400'
  }]
};
