// tsc does not copy the node icon; n8n loads it from next to the compiled node.
const fs = require('node:fs');
const path = require('node:path');

const from = path.join(__dirname, '..', 'nodes', 'DialgemTrigger', 'dialgem.svg');
const to = path.join(__dirname, '..', 'dist', 'nodes', 'DialgemTrigger', 'dialgem.svg');
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);
