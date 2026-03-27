import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { context } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'apps/demo-spa/dist');
const host = readArg('--host') ?? '127.0.0.1';
const port = Number(readArg('--port') ?? '4173');

await mkdir(distDir, { recursive: true });
await copyStatic();
watchStatic('apps/demo-spa/src/index.html', 'apps/demo-spa/dist/index.html');
watchStatic('apps/demo-spa/src/styles.css', 'apps/demo-spa/dist/styles.css');

const ctx = await context({
  entryPoints: [path.join(rootDir, 'apps/demo-spa/src/main.ts')],
  outfile: path.join(distDir, 'main.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome114'],
  sourcemap: true,
  tsconfig: path.join(rootDir, 'tsconfig.base.json')
});

await ctx.watch();

createServer(async (request, response) => {
  const requestPath = request.url && request.url !== '/' ? request.url.split('?')[0] : '/index.html';
  const filePath = requestPath === '/index.html' || path.extname(requestPath)
    ? path.join(distDir, requestPath.replace(/^\//, ''))
    : path.join(distDir, 'index.html');

  try {
    const contents = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader('content-type', contentTypeFor(filePath));
    response.end(contents);
  } catch {
    const html = await readFile(path.join(distDir, 'index.html'));
    response.statusCode = 200;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(html);
  }
}).listen(port, host, () => {
  process.stdout.write(`demo SPA available at http://${host}:${port}\n`);
});

async function copyStatic(): Promise<void> {
  await copy('apps/demo-spa/src/index.html', 'apps/demo-spa/dist/index.html');
  await copy('apps/demo-spa/src/styles.css', 'apps/demo-spa/dist/styles.css');
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

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith('.js')) {
    return 'application/javascript; charset=utf-8';
  }
  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }
  return 'text/html; charset=utf-8';
}
