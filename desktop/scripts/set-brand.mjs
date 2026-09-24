import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fija la marca activa copiando brands/<marca>.json a electron/active-brand.json.
 * Ese archivo es el que leen el proceso principal, Vite y electron-builder, así que la marca
 * queda horneada en el build y no depende de variables de entorno en tiempo de ejecución.
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandsDir = path.join(root, 'brands');
const requested = process.argv[2] || process.env.BRAND || 'instagramMoney';
const source = path.join(brandsDir, `${requested}.json`);

if (!fs.existsSync(source)) {
  const available = fs
    .readdirSync(brandsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''));
  console.error(`\n  No existe la marca "${requested}".`);
  console.error(`  Marcas disponibles: ${available.join(', ')}\n`);
  process.exit(1);
}

fs.copyFileSync(source, path.join(root, 'electron', 'active-brand.json'));
console.log(`  Marca activa: ${JSON.parse(fs.readFileSync(source, 'utf8')).productName}`);
