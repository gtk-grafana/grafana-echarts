import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoFile = (path: string) => resolve(process.cwd(), path);
const manifest = JSON.parse(readFileSync(repoFile('src/modules/relations/plugin.json'), 'utf8')) as { id: string };
const approvedPluginId = 'grafana-echarts-relations-panel';

const dashboardFiles = [
  ...globSync('provisioning/dashboards/relations/*.json'),
  ...globSync('lgtm/provisioning/dashboards/**/*.json'),
];

const panelTypes = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap(panelTypes);
  }

  if (value === null || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, entry]) => {
    // Only panel type fields can identify the Relations plugin in dashboard JSON.
    if (key === 'type' && typeof entry === 'string' && entry.includes('relations')) {
      return [entry];
    }

    return panelTypes(entry);
  });
};

describe('Relations plugin ID', () => {
  it('uses the approved manifest ID', () => {
    expect(manifest.id).toBe(approvedPluginId);
  });

  it('keeps provisioned dashboards aligned with the manifest', () => {
    const relationsPanelTypes = dashboardFiles.flatMap((path) =>
      panelTypes(JSON.parse(readFileSync(repoFile(path), 'utf8')))
    );

    expect(relationsPanelTypes.length).toBeGreaterThan(0);
    expect(new Set(relationsPanelTypes)).toEqual(new Set([manifest.id]));
  });
});
