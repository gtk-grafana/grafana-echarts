import { type Field, FieldType, type LinkModel, toDataFrame } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { type PanelContext, PanelContextProvider } from '@grafana/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { type TooltipModel } from 'lib/echarts/tooltip/model';
import React from 'react';
import { EChartsTooltip } from './EChartsTooltip';
import { TOOLTIP_MARKER_ATTR, type EChartsTooltipState } from './useEChartsTooltip';

const model = (over: Partial<TooltipModel> = {}): TooltipModel => ({
  header: { label: '', value: 'MyHeader' },
  rows: [{ label: 'Series A', value: '42', color: '#ff0000' }],
  ...over,
});

const state = (over: Partial<EChartsTooltipState> = {}): EChartsTooltipState => ({
  model: model(),
  position: { x: 10, y: 10 },
  visible: true,
  pinned: false,
  pinnedItem: null,
  activeSeriesIndex: null,
  ...over,
});

const renderTooltip = (
  tooltipState: EChartsTooltipState,
  panelContext?: Partial<PanelContext>,
  mode: TooltipDisplayMode = TooltipDisplayMode.Single
) => {
  const ui = <EChartsTooltip state={tooltipState} dismiss={jest.fn()} mode={mode} />;
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

  it('resolves the footer from the clicked row in multi-row (All) tooltips', () => {
    const source = { field: fieldWithLinks(), rowIndex: 0 };
    const multiModel = model({
      source: undefined,
      rows: [
        { label: 'Series A', value: '1', seriesIndex: 0 },
        { label: 'Series B', value: '2', seriesIndex: 1, source },
      ],
    });

    // Pinned via an empty-grid click (no element): no footer.
    renderTooltip(state({ model: multiModel, pinned: true, pinnedItem: null }));
    expect(screen.queryByText('MyLink')).not.toBeInTheDocument();

    // Pinned on series B's element: B's data links show.
    renderTooltip(state({ model: multiModel, pinned: true, pinnedItem: { seriesIndex: 1, dataIndex: 0 } }));
    expect(screen.getByText('MyLink')).toBeInTheDocument();
  });

  it('emphasises the proximity-focused row in All mode only', () => {
    const multiModel = model({
      source: undefined,
      rows: [
        { label: 'Series A', value: '1', color: '#f00', seriesIndex: 0 },
        { label: 'Series B', value: '2', color: '#0f0', seriesIndex: 1 },
      ],
    });
    // `VizTooltipRow` marks the active row by adding a class to its *label*.
    // Comparing the two labels' classes detects that without depending on
    // emotion's generated names or on jsdom resolving the cascade.
    const labelClasses = (label: string) => screen.getByText(label).className;
    const emphasisDiffers = () => labelClasses('Series A') !== labelClasses('Series B');

    const { unmount } = renderTooltip(
      state({ model: multiModel, activeSeriesIndex: 1 }),
      undefined,
      TooltipDisplayMode.Multi
    );
    expect(emphasisDiffers()).toBe(true);
    // ...and it is B, the focused series, that carries the extra class.
    expect(labelClasses('Series B').split(' ').length).toBeGreaterThan(labelClasses('Series A').split(' ').length);
    unmount();

    // Nothing within the focus band -> no row is emphasised.
    const { unmount: unmount2 } = renderTooltip(
      state({ model: multiModel, activeSeriesIndex: null }),
      undefined,
      TooltipDisplayMode.Multi
    );
    expect(emphasisDiffers()).toBe(false);
    unmount2();

    // Single mode never emphasises, matching core.
    renderTooltip(state({ model: multiModel, activeSeriesIndex: 1 }), undefined, TooltipDisplayMode.Single);
    expect(emphasisDiffers()).toBe(false);
  });

  it('emphasises no row when several share the active series index', () => {
    // A multi-value item (candlestick/boxplot) expands into one row per packed
    // dimension, all from the same series — so no single row is "the" active one.
    const packed = model({
      source: undefined,
      rows: [
        { label: 'Open', value: '1', seriesIndex: 0 },
        { label: 'Close', value: '2', seriesIndex: 0 },
      ],
    });
    renderTooltip(state({ model: packed, activeSeriesIndex: 0 }), undefined, TooltipDisplayMode.Multi);

    expect(screen.getByText('Open').className).toBe(screen.getByText('Close').className);
  });

  it('is click-through while hovering and interactive once pinned', () => {
    // Regression: without the marker attribute the outside-click handler treats
    // a click on a data link as a click outside and dismisses instantly, and
    // without pointer-events the click never lands at all — between them the
    // pinned tooltip was completely uninteractable.
    const { unmount } = renderTooltip(state());
    const hovering = document.querySelector<HTMLElement>(`[${TOOLTIP_MARKER_ATTR}]`);
    expect(hovering).not.toBeNull();
    expect(hovering!.style.pointerEvents).toBe('none');
    unmount();

    renderTooltip(state({ pinned: true }));
    const pinned = document.querySelector<HTMLElement>(`[${TOOLTIP_MARKER_ATTR}]`);
    expect(pinned!.style.pointerEvents).toBe('auto');
    // The dismiss handler looks the marker up with `closest`, so content inside
    // must resolve back to it.
    expect(screen.getByText('Series A').closest(`[${TOOLTIP_MARKER_ATTR}]`)).toBe(pinned);
  });

  it('positions with a transform and no layout padding of its own', () => {
    // The VizTooltip pieces carry their own padding; an extra layer of it made
    // the header too tall and pushed the absolutely-positioned close button out
    // of alignment with it.
    renderTooltip(state({ position: { x: 30, y: 40 } }));
    const wrapper = document.querySelector<HTMLElement>(`[${TOOLTIP_MARKER_ATTR}]`)!;

    expect(wrapper.style.transform).toBe('translateX(40px) translateY(50px)');
    expect(getComputedStyle(wrapper).padding).toBe('');
    // Core positions purely by transform; a transition makes the tooltip lag the cursor.
    expect(getComputedStyle(wrapper).transition).toBe('');
  });

  it('shows a close button that dismisses only when pinned', () => {
    const dismiss = jest.fn();
    const { rerender } = render(<EChartsTooltip state={state()} dismiss={dismiss} mode={TooltipDisplayMode.Single} />);
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();

    rerender(<EChartsTooltip state={state({ pinned: true })} dismiss={dismiss} mode={TooltipDisplayMode.Single} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(dismiss).toHaveBeenCalled();
  });
});
