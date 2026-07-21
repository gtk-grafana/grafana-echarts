import { type Field, FieldType, type LinkModel, toDataFrame } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { type PanelContext, PanelContextProvider } from '@grafana/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { type TooltipModel } from 'lib/echarts/tooltip/model';
import React from 'react';
import { EChartsTooltip } from './EChartsTooltip';
import { type EChartsTooltipState } from './useEChartsTooltip';

const model = (over: Partial<TooltipModel> = {}): TooltipModel => ({
  header: 'MyHeader',
  rows: [{ label: 'Series A', value: '42', color: '#ff0000' }],
  ...over,
});

const state = (over: Partial<EChartsTooltipState> = {}): EChartsTooltipState => ({
  model: model(),
  position: { x: 10, y: 10 },
  visible: true,
  pinned: false,
  ...over,
});

const renderTooltip = (tooltipState: EChartsTooltipState, panelContext?: Partial<PanelContext>) => {
  const ui = <EChartsTooltip state={tooltipState} mode={TooltipDisplayMode.Single} />;
  return render(
    panelContext ? <PanelContextProvider value={panelContext as PanelContext}>{ui}</PanelContextProvider> : ui
  );
};

const fieldWithLinks = (): Field => {
  const field = toDataFrame({
    fields: [
      { name: 'v', type: FieldType.number, values: [1], config: { links: [{ title: 'MyLink', url: 'http://x' }] } },
    ],
  }).fields[0];

  field.getLinks = () => [{ title: 'MyLink', href: 'http://x', target: '_self', origin: field } as LinkModel];
  return field;
};

const fieldWithLabels = (): Field => {
  const field = toDataFrame({ fields: [{ name: 'v', type: FieldType.number, values: [1] }] }).fields[0];
  field.labels = { host: 'web1' };
  return field;
};

describe('EChartsTooltip', () => {
  it('renders nothing when hidden, or without a model / position', () => {
    renderTooltip(state({ visible: false }));
    expect(screen.queryByText('MyHeader')).not.toBeInTheDocument();

    renderTooltip(state({ model: null }));
    expect(screen.queryByText('MyHeader')).not.toBeInTheDocument();

    renderTooltip(state({ position: null }));
    expect(screen.queryByText('MyHeader')).not.toBeInTheDocument();
  });

  it('renders the header and one row per series', () => {
    renderTooltip(state());
    expect(screen.getByText('MyHeader')).toBeInTheDocument();
    expect(screen.getByText('Series A')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('shows data links in the footer only when pinned', () => {
    const source = { field: fieldWithLinks(), rowIndex: 0 };

    renderTooltip(state({ model: model({ source }), pinned: false }));
    expect(screen.queryByText('MyLink')).not.toBeInTheDocument();

    renderTooltip(state({ model: model({ source }), pinned: true }));
    expect(screen.getByText('MyLink')).toBeInTheDocument();
  });

  it('renders ad-hoc filter buttons that call onAddAdHocFilter when pinned', () => {
    const onAddAdHocFilter = jest.fn();
    const source = { field: fieldWithLabels(), rowIndex: 0 };

    renderTooltip(state({ model: model({ source }), pinned: true }), { onAddAdHocFilter });

    const filterButton = screen.getByRole('button', { name: /Filter for/i });
    fireEvent.click(filterButton);
    expect(onAddAdHocFilter).toHaveBeenCalledWith({ key: 'host', value: 'web1', operator: '=' });
  });
});
