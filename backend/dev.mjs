import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const winPy = resolve('.venv/Scripts/python.exe');
const unixPy = resolve('.venv/bin/python');

const python = existsSync(winPy)
  ? winPy
  : existsSync(unixPy)
    ? unixPy
    : 'python';

const child = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--port', '8000', '--reload'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    LMPC_ALLOW_TUNNEL_ORIGINS: process.env.LMPC_ALLOW_TUNNEL_ORIGINS ?? 'true',
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
