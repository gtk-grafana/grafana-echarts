import { createHash } from 'node:crypto';
import { chmodSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const expectedPluginId = 'grafana-relations-panel';
const repositoryRoot = process.cwd();
const distDirectory = resolve(repositoryRoot, 'dist');
const manifest = JSON.parse(readFileSync(join(distDirectory, 'plugin.json'), 'utf8'));

if (manifest.id !== expectedPluginId || manifest.type !== 'panel') {
  throw new Error(`Expected ${expectedPluginId} panel build in dist, found ${manifest.id} (${manifest.type}).`);
}

const requiredFiles = ['module.js', 'README.md', 'CHANGELOG.md', 'LICENSE'];
for (const requiredFile of requiredFiles) {
  readFileSync(join(distDirectory, requiredFile));
}

const archiveName = `${manifest.id}-${manifest.info.version}.zip`;
const archivePath = resolve(repositoryRoot, archiveName);
const checksumPath = `${archivePath}.sha256`;
const stagingDirectory = mkdtempSync(join(tmpdir(), 'grafana-relations-package-'));
const archiveTimestamp = new Date('1980-01-01T00:00:00.000Z');

const normalizeFiles = (directory, relativeDirectory) =>
  readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    .flatMap((entry) => {
      const entryPath = join(directory, entry.name);
      const relativePath = join(relativeDirectory, entry.name);

      if (entry.isDirectory()) {
        return normalizeFiles(entryPath, relativePath);
      }
      if (!entry.isFile()) {
        throw new Error(`Unsupported archive entry: ${relativePath}`);
      }

      chmodSync(entryPath, 0o644);
      utimesSync(entryPath, archiveTimestamp, archiveTimestamp);
      return relativePath;
    });

try {
  // Grafana archives require one top-level directory named after the plugin ID.
  const stagedPluginDirectory = join(stagingDirectory, manifest.id);
  cpSync(distDirectory, stagedPluginDirectory, { recursive: true });
  const archiveEntries = normalizeFiles(stagedPluginDirectory, manifest.id);
  rmSync(archivePath, { force: true });
  rmSync(checksumPath, { force: true });

  const zip = spawnSync('zip', ['-X', '-q', archivePath, ...archiveEntries], {
    cwd: stagingDirectory,
    env: { ...process.env, TZ: 'UTC' },
    stdio: 'inherit',
  });

  if (zip.error) {
    throw zip.error;
  }
  if (zip.status !== 0) {
    throw new Error(`zip exited with status ${zip.status}.`);
  }

  const checksum = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
  writeFileSync(checksumPath, `${checksum}  ${basename(archivePath)}\n`);

  console.log(`Created ${basename(archivePath)}`);
  console.log(`Created ${basename(checksumPath)}`);
} finally {
  rmSync(stagingDirectory, { recursive: true, force: true });
}
