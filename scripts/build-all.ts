import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const packageBuilds = [
  ['packages/schema/src/index.ts', 'packages/schema/dist/index.js', 'packages/schema/dist/index.cjs'],
  ['packages/selector-engine/src/index.ts', 'packages/selector-engine/dist/index.js', 'packages/selector-engine/dist/index.cjs'],
  ['packages/transport/src/index.ts', 'packages/transport/dist/index.js', 'packages/transport/dist/index.cjs'],
  ['packages/devtools-shared/src/index.ts', 'packages/devtools-shared/dist/index.js', 'packages/devtools-shared/dist/index.cjs'],
  ['packages/recorder-core/src/index.ts', 'packages/recorder-core/dist/index.js', 'packages/recorder-core/dist/index.cjs'],
  ['packages/sdk-browser/src/index.ts', 'packages/sdk-browser/dist/index.js', 'packages/sdk-browser/dist/index.cjs']
] as const;

await buildWorkspace();

async function buildWorkspace(): Promise<void> {
  for (const [entryPoint, esmOutfile, cjsOutfile] of packageBuilds) {
    await buildPackageBundle(entryPoint, esmOutfile, 'esm');
    await buildPackageBundle(entryPoint, cjsOutfile, 'cjs');
  }

  await buildSdkIife();
  await buildExtension();
  await buildDemo();
  await emitDeclarations();
}

async function buildPackageBundle(
  entryPoint: string,
  outfile: string,
  format: 'esm' | 'cjs',
): Promise<void> {
  await mkdir(path.dirname(path.join(rootDir, outfile)), { recursive: true });
  await build({
    entryPoints: [path.join(rootDir, entryPoint)],
    outfile: path.join(rootDir, outfile),
    bundle: true,
    sourcemap: true,
    format,
    platform: 'browser',
    target: ['chrome114', 'es2022'],
    tsconfig: path.join(rootDir, 'tsconfig.base.json')
  });
}

async function buildSdkIife(): Promise<void> {
  const outfile = path.join(rootDir, 'packages/sdk-browser/dist/iife/flow-recorder.iife.js');
  await mkdir(path.dirname(outfile), { recursive: true });
  await build({
    entryPoints: [path.join(rootDir, 'packages/sdk-browser/src/index.ts')],
    outfile,
    bundle: true,
    sourcemap: true,
    format: 'iife',
    globalName: 'FlowRecorderBundle',
    platform: 'browser',
    target: ['chrome114', 'es2022'],
    tsconfig: path.join(rootDir, 'tsconfig.base.json')
  });
}

async function buildExtension(): Promise<void> {
  const outdir = path.join(rootDir, 'apps/extension/dist');
  await mkdir(outdir, { recursive: true });
  await build({
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

  await copyFile('apps/extension/manifest.json', 'apps/extension/dist/manifest.json');
  await copyFile('apps/extension/src/popup/index.html', 'apps/extension/dist/popup.html');
  await copyFile('apps/extension/src/popup/styles.css', 'apps/extension/dist/popup.css');
  await copyFile('apps/extension/src/options/index.html', 'apps/extension/dist/options.html');
}

async function buildDemo(): Promise<void> {
  const outdir = path.join(rootDir, 'apps/demo-spa/dist');
  await mkdir(outdir, { recursive: true });
  await build({
    entryPoints: [path.join(rootDir, 'apps/demo-spa/src/main.ts')],
    outfile: path.join(outdir, 'main.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome114'],
    sourcemap: true,
    tsconfig: path.join(rootDir, 'tsconfig.base.json')
  });

  await copyFile('apps/demo-spa/src/index.html', 'apps/demo-spa/dist/index.html');
  await copyFile('apps/demo-spa/src/styles.css', 'apps/demo-spa/dist/styles.css');
}

async function emitDeclarations(): Promise<void> {
  const packageTsconfigs = [
    'packages/schema/tsconfig.json',
    'packages/selector-engine/tsconfig.json',
    'packages/transport/tsconfig.json',
    'packages/devtools-shared/tsconfig.json',
    'packages/recorder-core/tsconfig.json',
    'packages/sdk-browser/tsconfig.json'
  ];

  for (const tsconfig of packageTsconfigs) {
    execFileSync('pnpm', ['exec', 'tsc', '-p', tsconfig], {
      cwd: rootDir,
      stdio: 'inherit'
    });
  }
}

async function copyFile(from: string, to: string): Promise<void> {
  const source = path.join(rootDir, from);
  const target = path.join(rootDir, to);
  await mkdir(path.dirname(target), { recursive: true });
  const contents = await readFile(source, 'utf8');
  await writeFile(target, contents, 'utf8');
}
