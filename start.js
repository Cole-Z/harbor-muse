// npm start: load .env via Node's built-in --env-file only when it exists (no dotenv). Hosts can run `node server.js` with env vars.
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const env = path.join(__dirname, '.env');
const args = [...(fs.existsSync(env) ? ['--env-file=' + env] : []), path.join(__dirname, 'server.js')];
const child = spawn(process.execPath, args, { stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, sig) => process.exit(sig ? 1 : code ?? 0));
