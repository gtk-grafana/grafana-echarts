import { FieldType, LoadingState, toDataFrame } from '@grafana/data';
import { LegendDisplayMode } from '@grafana/schema';
import { render, screen } from '@testing-library/react';
import { type ChartModule } from 'lib/echarts/charts/types';
import { relationsChartModule } from 'lib/echarts/relations/chartModule';
import React from 'react';
import { getComponent } from 'test/panel';

const mockGetDataIssue = jest.fn();
const mockGetTimeline = jest.fn();
const mockChartModule: ChartModule = {
  legend: { showLegend: false, displayMode: LegendDisplayMode.List, placement: 'bottom', calcs: [] },
  buildOption: () => null,
  buildLegendItems: () => [],
  getDataIssue: mockGetDataIssue,
  getTimeline: mockGetTimeline,
};
let activeChartModule: ChartModule = mockChartModule;
const mockPanelDataErrorView = jest.fn(({ message }: { message?: string }) => <div>{message ?? 'No data'}</div>);

jest.mock('lib/echarts/charts/registry', () => ({
  resolveChartModule: () => activeChartModule,
}));

jest.mock('lib/components/EChart', () => ({
  EChart: () => <div>Chart</div>,
}));

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  PanelDataErrorView: (props: { message?: string }) => mockPanelDataErrorView(props),
}));

const emptyFrame = () =>
  toDataFrame({
    fields: [
      { name: 'source', type: FieldType.string, values: [] },
      { name: 'target', type: FieldType.string, values: [] },
      { name: 'value', type: FieldType.number, values: [] },
    ],
  });

const unsupportedFrame = () =>
  toDataFrame({
    fields: [{ name: 'value', type: FieldType.number, values: [1] }],
  });

const graphFrame = () =>
  toDataFrame({
    fields: [
      {
        name: 'requests',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'database' },
        values: [1],
      },
    ],
  });

const hiddenGraphConfig = {
  defaults: {},
  overrides: [
    {
      matcher: { id: 'byName', options: 'requests' },
      properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: false } }],
    },
  ],
};

describe('Panel empty view', () => {
  beforeEach(() => {
    activeChartModule = mockChartModule;
    mockGetDataIssue.mockReset();
    mockGetTimeline.mockReset();
    mockPanelDataErrorView.mockClear();
    mockGetTimeline.mockReturnValue([100, 200]);
  });

  it.each([
    ['no frames', []],
    ['one empty frame', [emptyFrame()]],
    ['multiple empty frames', [emptyFrame(), emptyFrame()]],
  ])('shows No data for relations with %s', (_name, frames) => {
    render(getComponent(frames, 'graph', undefined, undefined, undefined, 'relations'));

    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(mockGetDataIssue).not.toHaveBeenCalled();
  });

  it('shows a chart data issue after the selected time is resolved', () => {
    mockGetDataIssue.mockReturnValue({ reason: 'unsupported-shape', message: 'Frame issue' });

    render(getComponent([unsupportedFrame()], 'graph', undefined, undefined, undefined, 'relations'));

    expect(screen.getByText('Frame issue')).toBeInTheDocument();
    expect(screen.queryByText('Chart')).not.toBeInTheDocument();
    expect(mockGetDataIssue).toHaveBeenCalledWith(expect.objectContaining({ selectedTime: 200 }));
    expect(mockPanelDataErrorView).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ series: expect.any(Array) }),
        panelId: 1,
        fieldConfig: { defaults: {}, overrides: [] },
        message: 'Frame issue',
      })
    );
  });

  it('keeps the chart path while unsupported data is loading', () => {
    mockGetDataIssue.mockReturnValue({ reason: 'unsupported-shape', message: 'Frame issue' });

    render(
      getComponent([unsupportedFrame()], 'graph', undefined, { state: LoadingState.Loading }, undefined, 'relations')
    );

    expect(screen.getByText('Chart')).toBeInTheDocument();
    expect(screen.queryByText('Frame issue')).not.toBeInTheDocument();
    expect(mockGetDataIssue).not.toHaveBeenCalled();
  });

  it('does not hide a query error with a chart data issue', () => {
    mockGetDataIssue.mockReturnValue({ reason: 'unsupported-shape', message: 'Frame issue' });

    render(
      getComponent(
        [unsupportedFrame()],
        'graph',
        undefined,
        { state: LoadingState.Error, errors: [{ message: 'Query failed' }] },
        undefined,
        'relations'
      )
    );

    expect(screen.getByText('Chart')).toBeInTheDocument();
    expect(screen.queryByText('Frame issue')).not.toBeInTheDocument();
    expect(mockGetDataIssue).not.toHaveBeenCalled();
  });

  it('mounts chart content for a valid Relations graph', () => {
    activeChartModule = relationsChartModule;

    render(getComponent([graphFrame()], 'graph', undefined, undefined, undefined, 'relations'));

    expect(screen.getByText('Chart')).toBeInTheDocument();
    expect(mockPanelDataErrorView).not.toHaveBeenCalled();
  });

  it('shows the hidden-marks message from the Relations resolver', () => {
    activeChartModule = relationsChartModule;

    render(getComponent([graphFrame()], 'graph', undefined, undefined, undefined, 'relations', hiddenGraphConfig));

    expect(
      screen.getByText('All graph marks are hidden. Show at least one node or edge in the field configuration.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Chart')).not.toBeInTheDocument();
  });
});
