// Gera a pasta vendor/ com as bibliotecas usadas pelo app (Three.js, JSZip e Supabase),
// para o app não depender de CDN na hora de abrir e funcionar sem internet.
// Uso: npm install && npm run vendor
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const outDir = path.resolve('vendor');
mkdirSync(outDir, { recursive: true });

// Three.js já vem como um módulo único
copyFileSync(path.resolve('node_modules/three/build/three.module.js'), path.join(outDir, 'three.module.js'));

// OrbitControls importa 'three': aponta para a cópia local em vez de embutir outra
const threeExternal = {
  name: 'three-external',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: './three.module.js', external: true }));
  }
};

const common = { bundle: true, format: 'esm', platform: 'browser', target: 'chrome120', minify: true, legalComments: 'inline', logLevel: 'info' };

await build({
  ...common,
  entryPoints: [path.resolve('node_modules/three/examples/jsm/controls/OrbitControls.js')],
  outfile: path.join(outDir, 'OrbitControls.js'),
  plugins: [threeExternal]
});

await build({
  ...common,
  stdin: { contents: "export { default } from 'jszip';", resolveDir: process.cwd() },
  outfile: path.join(outDir, 'jszip.js')
});

await build({
  ...common,
  stdin: { contents: "export { createClient } from '@supabase/supabase-js';", resolveDir: process.cwd() },
  outfile: path.join(outDir, 'supabase.js')
});
