import { LegendDisplayMode, type VizLegendOptions } from '@grafana/schema';
import { type VizLegendItem } from '@grafana/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { Legend } from './Legend';

const legend = (overrides: Partial<VizLegendOptions> = {}): VizLegendOptions => ({
  showLegend: true,
  displayMode: LegendDisplayMode.Table,
  placement: 'bottom',
  calcs: [],
  ...overrides,
});

const items = (labels: string[]): VizLegendItem[] =>
  labels.map((label) => ({ label, color: '#000', yAxis: 1, getItemKey: () => label }));

describe('Legend limit', () => {
  it('shows all rows when no limit is set', () => {
    render(<Legend items={items(['a', 'b', 'c'])} legend={legend()} width={400} height={120} />);

    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('c')).toBeInTheDocument();
  });

  it('collapses to the first N rows and reveals the rest via the "show all" toggle', () => {
    render(<Legend items={items(['a', 'b', 'c', 'd', 'e'])} legend={legend({ limit: 2 })} width={400} height={120} />);

    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.queryByText('c')).not.toBeInTheDocument();
    expect(screen.queryByText('e')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show all/i }));

    expect(screen.getByText('c')).toBeInTheDocument();
    expect(screen.getByText('e')).toBeInTheDocument();
  });
});

describe('Legend list mode', () => {
  it('renders items in list display mode', () => {
    render(
      <Legend
        items={items(['series-a', 'series-b'])}
        legend={legend({ displayMode: LegendDisplayMode.List })}
        width={400}
        height={48}
      />
    );

    expect(screen.getByText('series-a')).toBeInTheDocument();
    expect(screen.getByText('series-b')).toBeInTheDocument();
  });
});
