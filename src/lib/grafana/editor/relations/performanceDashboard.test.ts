import { readFileSync } from 'fs';
import { join } from 'path';

const dashboardPath = join(__dirname, '../../../../..', 'provisioning/dashboards/relations/performance-limits.json');

interface PerformancePanel {
  type: string;
  transformations?: Array<{ id: string; options: Record<string, unknown> }>;
}

const dashboard = (): { panels: PerformancePanel[] } => JSON.parse(readFileSync(dashboardPath, 'utf8'));

describe('the Relations performance-limits dashboard', () => {
  it('converts every TestData Node Graph response to wide fields', () => {
    const panels = dashboard().panels.filter(({ type }) => type === 'grafana-echarts-relations-panel');

    expect(panels).toHaveLength(12);
    expect(panels.every(({ transformations }) => transformations?.some(({ id }) => id === 'rowsToFields'))).toBe(true);
  });
});
