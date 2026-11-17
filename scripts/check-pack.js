// Fails the release if the npm package would ship the wrong files.
// n8n loads the compiled node, credential and icon; sources and tests must not go out.
const { execSync } = require('node:child_process');

const out = JSON.parse(execSync('npm pack --dry-run --json', { encoding: 'utf8' }));
const files = out[0].files.map((f) => f.path);
console.log(files.join('\n'));

const required = [
  'dist/nodes/DialgemTrigger/DialgemTrigger.node.js',
  'dist/credentials/DialgemApi.credentials.js',
  'dist/nodes/DialgemTrigger/dialgem.svg',
  'package.json',
  'README.md',
  'LICENSE',
];
const missing = required.filter((r) => !files.includes(r));
const stray = files.filter((p) => /^(test|nodes|credentials|scripts|\.github)\//.test(p) || /\.ts$/.test(p) || p.startsWith('dist/test/'));

if (missing.length || stray.length) {
  if (missing.length) console.error('Missing from the package:', missing.join(', '));
  if (stray.length) console.error('Would be published by mistake:', stray.join(', '));
  process.exit(1);
}
console.log(`\nPackage contents ok (${files.length} files).`);
