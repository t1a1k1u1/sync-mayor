import * as esbuild from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const isWatch = process.argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  sourcemap: false,
};

const entries = [
  {
    entryPoints: ['src/background/service-worker.ts'],
    outfile: 'dist/background/service-worker.js',
    format: 'esm', // MV3 Service Worker は ESM に対応
  },
  {
    entryPoints: ['src/content/prime-video.ts'],
    outfile: 'dist/content/prime-video.js',
    format: 'iife', // Content Script は IIFE
  },
  {
    entryPoints: ['src/popup/popup.ts'],
    outfile: 'dist/popup/popup.js',
    format: 'iife',
  },
  {
    entryPoints: ['src/offscreen/offscreen.ts'],
    outfile: 'dist/offscreen/offscreen.js',
    format: 'iife',
  },
];

async function copyStaticFiles() {
  await mkdir('dist/popup', { recursive: true });
  await mkdir('dist/offscreen', { recursive: true });
  await mkdir('dist/icons', { recursive: true });

  // manifest.json をコピー
  await cp('manifest.json', 'dist/manifest.json');

  // HTML をコピー
  if (existsSync('src/popup/popup.html')) {
    await cp('src/popup/popup.html', 'dist/popup/popup.html');
  }
  if (existsSync('src/offscreen/offscreen.html')) {
    await cp('src/offscreen/offscreen.html', 'dist/offscreen/offscreen.html');
  }

  // CSS をコピー
  if (existsSync('src/popup/popup.css')) {
    await cp('src/popup/popup.css', 'dist/popup/popup.css');
  }

  // アイコンをコピー
  if (existsSync('icons')) {
    await cp('icons', 'dist/icons', { recursive: true });
  }
}

if (isWatch) {
  const contexts = await Promise.all(
    entries.map((entry) => esbuild.context({ ...sharedOptions, ...entry })),
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  await copyStaticFiles();
  console.log('Watching for changes...');
} else {
  await Promise.all(entries.map((entry) => esbuild.build({ ...sharedOptions, ...entry })));
  await copyStaticFiles();
  console.log('Build complete.');
}
