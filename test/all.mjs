// Keep native engines isolated: each test file gets a fresh Node process.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tests = readdirSync(new URL('./', import.meta.url)).filter((name) => name.endsWith('.ts')).sort();
if (!tests.length) {throw new Error('No TypeScript test entrypoints found');}
let failed = 0;
for (const name of tests) {
  console.log(`\n[test] ${name}`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', `test/${name}`], {
    cwd: root, stdio: 'inherit', timeout: 180_000,
  });
  if (result.status !== 0 || result.error) {
    failed++;
    console.error(`[test] ${name} failed (${result.error?.message ?? result.signal ?? result.status})`);
  }
}
console.log(`\n[test] ${tests.length - failed}/${tests.length} entrypoints passed`);
process.exitCode = failed ? 1 : 0;
