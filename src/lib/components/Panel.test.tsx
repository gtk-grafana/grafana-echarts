import { FieldType, LoadingState, type PanelData, toDataFrame } from '@grafana/data';
import { LegendDisplayMode } from '@grafana/schema';
import { render, screen } from '@testing-library/react';
import { type ChartModule } from 'lib/echarts/charts/types';
import { relationsChartModule } from 'lib/echarts/relations/chartModule';
import React, { Children, cloneElement, type ReactElement } from 'react';
import { getComponent } from 'test/panel';
import { type PanelComponentProps } from './types';

const mockGetDataIssue = jest.fn();
const mockGetTimeline = jest.fn();
const mockEChart = jest.fn(({ width }: { width: number }) => (
  <div data-testid="chart" data-width={width}>
    Chart
  </div>
));
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
  EChart: (props: { width: number }) => mockEChart(props),
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

type FrameMutation = (frames: PanelData['series']) => PanelData['series'];

const previewFrameChanges: Array<[string, FrameMutation]> = [
  ['frame count', (frames) => [...frames, { ...frames[0] }]],
  ['frame length', (frames) => [{ ...frames[0], length: frames[0].length + 1 }]],
  ['field count', (frames) => [{ ...frames[0], fields: [...frames[0].fields, { ...frames[0].fields[0] }] }]],
  [
    'field name',
    (frames) => [{ ...frames[0], fields: [{ ...frames[0].fields[0], name: `${frames[0].fields[0].name}-changed` }] }],
  ],
  ['field type', (frames) => [{ ...frames[0], fields: [{ ...frames[0].fields[0], type: FieldType.string }] }]],
  [
    'field labels object',
    (frames) => [{ ...frames[0], fields: [{ ...frames[0].fields[0], labels: { ...frames[0].fields[0].labels } }] }],
  ],
];

describe('Panel empty view', () => {
  beforeEach(() => {
    activeChartModule = mockChartModule;
    mockGetDataIssue.mockReset();
    mockGetTimeline.mockReset();
    mockEChart.mockClear();
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

  it('shows the newest timeline stop in a preset preview', () => {
    render(getComponent([graphFrame()], 'graph', { isPreview: true }, undefined, undefined, 'relations'));

    expect(screen.getByRole('slider', { name: 'Selected time' })).toBeInTheDocument();
    expect(mockGetDataIssue).toHaveBeenCalledWith(expect.objectContaining({ selectedTime: 200 }));
  });

  it('does not render a preset preview again when converter inputs retain identity', () => {
    const initialRequest = { requestId: 'initial' } as NonNullable<PanelData['request']>;
    const initial = getComponent(
      [graphFrame()],
      'graph',
      {
        isPreview: true,
        relationsLayout: 'force',
        relationsRepulsion: 100,
        relationsEdgeLength: 50,
      },
      { request: initialRequest, errors: [{ message: 'Initial query error' }] },
      undefined,
      'relations'
    );
    const panel = Children.only(initial.props.children) as ReactElement<PanelComponentProps>;
    const frames = panel.props.data.series.map((frame) => ({
      ...frame,
      fields: frame.fields.map((field) => ({ ...field, config: { ...field.config } })),
    }));
    const { rerender } = render(initial);

    rerender(
      cloneElement(
        initial,
        {},
        cloneElement(panel, {
          data: {
            ...panel.props.data,
            series: frames,
            timeRange: { ...panel.props.data.timeRange, raw: { ...panel.props.data.timeRange.raw } },
            request: { ...initialRequest, requestId: 'next' },
            errors: [{ message: 'Next query error' }],
          },
          options: {
            ...panel.props.options,
            relationsRepulsion: 800,
            relationsEdgeLength: 200,
            relationsLayoutAnimation: true,
          },
          width: panel.props.width - 100,
          height: panel.props.height - 100,
          fieldConfig: {
            defaults: { ...panel.props.fieldConfig.defaults },
            overrides: panel.props.fieldConfig.overrides.slice(),
          },
          timeRange: { ...panel.props.timeRange, raw: { ...panel.props.timeRange.raw } },
          renderCounter: panel.props.renderCounter + 1,
          onChangeTimeRange: jest.fn(),
          onFieldConfigChange: jest.fn(),
          onOptionsChange: jest.fn(),
          replaceVariables: jest.fn((value: string) => value),
        })
      )
    );

    expect(mockEChart).toHaveBeenCalledTimes(1);
  });

  it('renders a preset preview again when one field values object changes', () => {
    const initial = getComponent([graphFrame()], 'graph', { isPreview: true }, undefined, undefined, 'relations');
    const panel = Children.only(initial.props.children) as ReactElement<PanelComponentProps>;
    const frame = panel.props.data.series[0];
    const field = frame.fields[0];
    const { rerender } = render(initial);

    rerender(
      cloneElement(
        initial,
        {},
        cloneElement(panel, {
          data: {
            ...panel.props.data,
            series: [{ ...frame, fields: [{ ...field, values: Array.from(field.values) }] }],
          },
        })
      )
    );

    expect(mockEChart).toHaveBeenCalledTimes(2);
  });

  it.each(previewFrameChanges)('renders a preset preview again when its %s changes', (_name, changeFrames) => {
    const initial = getComponent([graphFrame()], 'graph', { isPreview: true }, undefined, undefined, 'relations');
    const panel = Children.only(initial.props.children) as ReactElement<PanelComponentProps>;
    const { rerender } = render(initial);

    rerender(
      cloneElement(
        initial,
        {},
        cloneElement(panel, {
          data: { ...panel.props.data, series: changeFrames(panel.props.data.series) },
        })
      )
    );

    expect(mockEChart).toHaveBeenCalledTimes(2);
  });

  it('renders a preset preview again when its loading state changes', () => {
    const initial = getComponent([graphFrame()], 'graph', { isPreview: true }, undefined, undefined, 'relations');
    const panel = Children.only(initial.props.children) as ReactElement<PanelComponentProps>;
    const { rerender } = render(initial);

    rerender(
      cloneElement(initial, {}, cloneElement(panel, { data: { ...panel.props.data, state: LoadingState.Loading } }))
    );

    expect(mockEChart).toHaveBeenCalledTimes(2);
  });

  it('renders a preset preview again when a query error appears', () => {
    const initial = getComponent([graphFrame()], 'graph', { isPreview: true }, undefined, undefined, 'relations');
    const panel = Children.only(initial.props.children) as ReactElement<PanelComponentProps>;
    const { rerender } = render(initial);

    rerender(
      cloneElement(
        initial,
        {},
        cloneElement(panel, { data: { ...panel.props.data, errors: [{ message: 'Query failed' }] } })
      )
    );

    expect(mockEChart).toHaveBeenCalledTimes(2);
  });

  it('renders a dashboard panel again when its width and options change', () => {
    const initial = getComponent(
      [graphFrame()],
      'graph',
      { relationsLayout: 'force', relationsRepulsion: 100 },
      undefined,
      undefined,
      'relations'
    );
    const panel = Children.only(initial.props.children) as ReactElement<PanelComponentProps>;
    const nextWidth = panel.props.width - 100;
    const { rerender } = render(initial);

    rerender(
      cloneElement(
        initial,
        {},
        cloneElement(panel, {
          width: nextWidth,
          options: { ...panel.props.options, relationsRepulsion: 800 },
        })
      )
    );

    expect(mockEChart).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('chart')).toHaveAttribute('data-width', String(nextWidth));
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

  it('renders no panel content while non-empty data is streaming', () => {
    render(getComponent([graphFrame()], 'graph', undefined, { state: LoadingState.Streaming }, undefined, 'relations'));

    expect(screen.queryByText('Chart')).not.toBeInTheDocument();
    expect(mockPanelDataErrorView).not.toHaveBeenCalled();
    expect(mockGetDataIssue).not.toHaveBeenCalled();
  });

  it('mounts chart content when streaming data finishes', () => {
    const { rerender } = render(
      getComponent([graphFrame()], 'graph', undefined, { state: LoadingState.Streaming }, undefined, 'relations')
    );

    expect(screen.queryByText('Chart')).not.toBeInTheDocument();

    rerender(getComponent([graphFrame()], 'graph', undefined, { state: LoadingState.Done }, undefined, 'relations'));

    expect(screen.getByText('Chart')).toBeInTheDocument();
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
