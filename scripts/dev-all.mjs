import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';

const backend = spawn('pnpm', ['-C', 'backend', 'dev'], {
  stdio: 'inherit',
  shell: isWin,
});

const frontend = spawn('pnpm', ['-C', 'frontend', 'dev'], {
  stdio: 'inherit',
  shell: isWin,
});

function cleanup() {
  backend.kill();
  frontend.kill();
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
