import { watch } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { context } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(rootDir, 'apps/extension/dist');

await mkdir(outdir, { recursive: true });
await copyStatic();

watchStatic('apps/extension/manifest.json', 'apps/extension/dist/manifest.json');
watchStatic('apps/extension/src/popup/index.html', 'apps/extension/dist/popup.html');
watchStatic('apps/extension/src/popup/styles.css', 'apps/extension/dist/popup.css');
watchStatic('apps/extension/src/options/index.html', 'apps/extension/dist/options.html');

const ctx = await context({
  entryPoints: {
    background: path.join(rootDir, 'apps/extension/src/background/index.ts'),
    content: path.join(rootDir, 'apps/extension/src/content/index.ts'),
    'page-bridge': path.join(rootDir, 'apps/extension/src/page-bridge/index.ts'),
    popup: path.join(rootDir, 'apps/extension/src/popup/index.ts'),
    options: path.join(rootDir, 'apps/extension/src/options/index.ts')
  },
  outdir,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome114'],
  sourcemap: true,
  entryNames: '[name]',
  tsconfig: path.join(rootDir, 'tsconfig.base.json')
});

await ctx.watch();
process.stdout.write(`extension build watching in ${outdir}\n`);

async function copyStatic(): Promise<void> {
  await copy('apps/extension/manifest.json', 'apps/extension/dist/manifest.json');
  await copy('apps/extension/src/popup/index.html', 'apps/extension/dist/popup.html');
  await copy('apps/extension/src/popup/styles.css', 'apps/extension/dist/popup.css');
  await copy('apps/extension/src/options/index.html', 'apps/extension/dist/options.html');
}

function watchStatic(source: string, target: string): void {
  watch(path.join(rootDir, source), () => {
    void copy(source, target);
  });
}

async function copy(source: string, target: string): Promise<void> {
  await writeFile(
    path.join(rootDir, target),
    await readFile(path.join(rootDir, source), 'utf8'),
    'utf8',
  );
}
