// Bundle self-check: run locally with `node scripts/verify.mjs`, also used by CI.
// Keeps the two regressions that actually bit this repo out of main:
//   - a UTF-8 BOM on any text file (JSON.parse in pnpm/plugin installs fails)
//   - a manifest / export that points at a missing file
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const failures = [];
const fail = (message) => failures.push(message);

const textFiles = [];
const extraTextNames = new Set(['LICENSE', '.gitignore', '.gitattributes']);
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(json|js|mjs|yml|yaml|md|svg)$/.test(entry.name) || extraTextNames.has(entry.name)) textFiles.push(full);
  }
}
walk(root);

for (const file of textFiles) {
  const bytes = fs.readFileSync(file);
  const relative = path.relative(root, file);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail(`UTF-8 BOM in ${relative}`);
  if (!bytes.toString('utf8').includes('\uFFFD')) continue;
  fail(`invalid UTF-8 (replacement characters) in ${relative}`);
}

for (const file of textFiles.filter((name) => name.endsWith('.json'))) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`invalid JSON in ${path.relative(root, file)}: ${error.message}`);
  }
}

const clientPath = path.join(root, 'lib', 'client.js');
try {
  new vm.Script(fs.readFileSync(clientPath, 'utf8'), { filename: clientPath });
} catch (error) {
  fail(`lib/client.js does not parse: ${error.message}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (manifest.name !== 'dsh-pinned-panel') fail(`unexpected package name ${manifest.name}`);
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail(`unexpected version ${manifest.version}`);
if (manifest.license !== 'MIT') fail('license must stay MIT');
for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
  if (subpath.includes('*')) continue;
  if (!fs.existsSync(path.join(root, target))) fail(`exports["${subpath}"] points at missing ${target}`);
}
const patch = manifest.dsh?.bundle?.patch;
if (typeof patch !== 'string' || !fs.existsSync(path.join(root, patch))) fail('dsh.bundle.patch must point at an existing patch file');
if (manifest.dsh?.client?.platform !== 'web') fail('dsh.client.platform must be "web"');
if (!String(manifest.dsh?.client?.inject ?? []).includes('@deepseek-ai/dsh-client-ui-workspace')) {
  fail('dsh.client.inject must activate after @deepseek-ai/dsh-client-ui-workspace');
}
for (const required of ['index.js', 'lib/client.js', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/zh.json']) {
  if (!fs.existsSync(path.join(root, required))) fail(`missing ${required}`);
}

const source = fs.readFileSync(clientPath, 'utf8');
for (const id of ['dsh-pinned-panel', '@local/dsh-pinned-panel']) {
  if (!source.includes(`load({ id: '${id}'`)) fail(`client bundle does not register module id ${id}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log(`OK — ${textFiles.length} text files clean, manifest and client bundle verified`);
