import { VizLegendItem } from '@grafana/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { LegendTable } from './LegendTable';

const items = (labels: string[]): VizLegendItem[] =>
  labels.map((label) => ({ label, color: '#000', yAxis: 1, getItemKey: () => label }));

describe('LegendTable limit', () => {
  it('shows all rows when no limit is set', () => {
    render(<LegendTable items={items(['a', 'b', 'c'])} placement="bottom" width={400} height={120} />);

    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('c')).toBeInTheDocument();
  });

  it('collapses to the first N rows and reveals the rest via the "show all" toggle', () => {
    render(<LegendTable items={items(['a', 'b', 'c', 'd', 'e'])} placement="bottom" width={400} height={120} limit={2} />);

    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.queryByText('c')).not.toBeInTheDocument();
    expect(screen.queryByText('e')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show all/i }));

    expect(screen.getByText('c')).toBeInTheDocument();
    expect(screen.getByText('e')).toBeInTheDocument();
  });
});
