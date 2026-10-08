import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_PACKAGE_PATHS } from './verify.mjs';

// Rebind only this fixed, public source/derived-summary package. Never inspect
// private receipts, credentials, connection/config material or library binaries.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const manifestPath = join(root, 'docs/qualification/qik-native-source-summary-20261007/source-summary-manifest.json');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function publicBytes(path) {
  let current = root;
  const parts = path.split('/');
  for (const [index, part] of parts.entries()) {
    if (!part || part === '.' || part === '..') throw new Error('PACKAGE_PATH_REFUSED');
    current = join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
      throw new Error('PACKAGE_PATH_REFUSED');
    }
  }
  const file = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error('PACKAGE_BYTES_REFUSED');
    return await file.readFile();
  } finally { await file.close(); }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && args[0] !== '--check')) throw new Error('CLI_ARGUMENTS_REFUSED');
  const oldBytes = await readFile(manifestPath);
  const manifest = JSON.parse(oldBytes.toString('utf8'));
  if (manifest.schema !== 'qik-native-evidence-20261007-1'
    || manifest.mode !== 'offline-native-evidence-integrity'
    || manifest.productionAuthorized !== false || manifest.liveReady !== false
    || manifest.hold !== 'PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD') {
    throw new Error('MANIFEST_SCOPE_REFUSED');
  }
  const files = [];
  for (const path of [...REQUIRED_PACKAGE_PATHS].sort()) {
    const bytes = await publicBytes(path);
    files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const nextBytes = Buffer.from(`${JSON.stringify({ ...manifest, files }, null, 2)}\n`);
  if (args[0] === '--check') {
    if (!nextBytes.equals(oldBytes)) throw new Error('PACKAGE_REBIND_REQUIRED');
  } else {
    await writeFile(manifestPath, nextBytes);
  }
  process.stdout.write(`${JSON.stringify({
    status: args[0] === '--check' ? 'SOURCE_PACKAGE_BYTES_CURRENT' : 'SOURCE_PACKAGE_BYTES_REBOUND',
    files: files.length,
    manifestSha256: sha256(nextBytes),
    qualification: false,
    productionAuthorized: false,
    liveReady: false,
  })}\n`);
}

main().catch(error => {
  const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PACKAGE_REBIND_REFUSED';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
