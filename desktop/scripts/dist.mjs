import { spawnSync } from 'node:child_process';

/** Genera el instalador de una marca: node scripts/dist.mjs dropprospect */
const brand = process.argv[2] || 'instagramMoney';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('node', ['scripts/set-brand.mjs', brand]);
run('npx', ['vite', 'build']);
run('npx', ['electron-builder', '--config', 'electron-builder.config.cjs']);
