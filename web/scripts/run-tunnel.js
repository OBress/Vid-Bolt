const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

/**
 * Cloudflare Tunnel Runner
 * Loads CLOUDFLARE_TUNNEL_TOKEN from .env.local and runs cloudflared
 */

const envPath = path.resolve(__dirname, '../.env.local');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.warn('[Tunnel] .env.local not found, falling back to process.env');
}

const token = process.env.CLOUDFLARE_TUNNEL_TOKEN;

if (!token) {
  console.error('\x1b[31m[Tunnel] Error: CLOUDFLARE_TUNNEL_TOKEN not found in environment or .env.local\x1b[0m');
  console.error('[Tunnel] Please add CLOUDFLARE_TUNNEL_TOKEN=your_token_here to .env.local');
  process.exit(1);
}

console.log(`[Tunnel] Starting Cloudflare tunnel with token: ${token.substring(0, 8)}...`);

const child = spawn('cloudflared', ['tunnel', 'run', '--token', token], {
  stdio: 'inherit',
  shell: true
});

child.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[Tunnel] cloudflared exited with code ${code}`);
    process.exit(code);
  }
});

// Handle termination
process.on('SIGINT', () => {
  child.kill('SIGINT');
  process.exit();
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
  process.exit();
});
