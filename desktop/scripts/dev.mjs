import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import electronPath from 'electron';

// La marca se puede elegir con: npm run dev -- dropprospect
const brand = process.argv[2] || process.env.BRAND || 'instagramMoney';
const setBrand = spawnSync('node', ['scripts/set-brand.mjs', brand], { stdio: 'inherit', shell: true });
if (setBrand.status !== 0) process.exit(setBrand.status ?? 1);

const server = await createServer();
await server.listen();

const { port } = server.config.server;
const url = `http://localhost:${port}`;
server.printUrls();

const electron = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

electron.on('close', async () => {
  await server.close();
  process.exit(0);
});
