import { fireEvent, render, screen } from '@testing-library/react';
import { type ChartZoomAction } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import React, { type MutableRefObject } from 'react';
import { ChartZoomControls } from './ChartZoomControls';

/**
 * The zoom buttons, tested against a stub chart rather than a real ECharts instance:
 * what this component decides is *which action to dispatch with which arguments*, and a
 * live chart would answer that question by drawing rather than by reporting it.
 *
 * That the dispatched action actually scales the view — the non-obvious half, since
 * `roam` is `false` and ECharts' own zoom is `roam` — is asserted on the pixels in
 * `relations-interaction.integration.test.tsx`.
 */

const action: ChartZoomAction = { type: 'graphRoam', seriesIndex: 0 };

/** `@testing-library/user-event` is not a dependency here; a plain click is enough. */
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

/** A chart that records what it was asked to do. */
const stubChart = () => {
  const dispatchAction = jest.fn();
  const setOption = jest.fn();
  const chart = { dispatchAction, setOption } as unknown as EChartsType;
  return { dispatchAction, setOption, ref: { current: chart } as MutableRefObject<EChartsType | null> };
};

const renderControls = (
  overrides: Partial<React.ComponentProps<typeof ChartZoomControls>> = {},
  chart = stubChart()
) => {
  render(<ChartZoomControls action={action} chartRef={chart.ref} width={400} height={300} {...overrides} />);
  return chart;
};

describe('ChartZoomControls', () => {
  // The family decides whether its series owns a view to scale (`getZoomAction`), so no
  // action means no buttons — a chord pins `coordinateSystem: 'none'` and has none.
  it('renders nothing when the family declares no zoom action', () => {
    const { container } = render(
      <ChartZoomControls action={undefined} chartRef={stubChart().ref} width={400} height={300} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders zoom in, zoom out and reset', () => {
    renderControls();

    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toBeInTheDocument();
  });

  /**
   * Anchored at the viz centre, which is the whole difference from a wheel zoom:
   * `originX`/`originY` are the fixed point of the scale, and a button has no pointer to
   * take one from. Zooming about the origin instead would walk the graph off the
   * top-left corner over a few clicks.
   */
  it('scales about the centre of the viz area', () => {
    const chart = renderControls();

    click('Zoom in');

    expect(chart.dispatchAction).toHaveBeenCalledWith({
      type: 'graphRoam',
      seriesIndex: 0,
      zoom: 1.3,
      originX: 200,
      originY: 150,
    });
  });

  // Out is in's reciprocal, so a click each way returns to the starting scale — the
  // action applies a multiplicative delta, not an absolute zoom.
  it('zooms out by the reciprocal of the step it zooms in by', () => {
    const chart = renderControls();

    click('Zoom in');
    click('Zoom out');

    const [[zoomIn], [zoomOut]] = chart.dispatchAction.mock.calls as Array<[{ zoom: number }]>;
    expect(zoomIn.zoom * zoomOut.zoom).toBeCloseTo(1);
  });

  // The action name comes from the family, so a sankey's buttons dispatch `sankeyRoam`.
  it('dispatches the action the family named', () => {
    const chart = renderControls({ action: { type: 'sankeyRoam', seriesIndex: 2 } });

    click('Zoom in');

    expect(chart.dispatchAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'sankeyRoam', seriesIndex: 2 }));
  });

  /**
   * Reset writes the identity to `zoom`/`center` with `setOption` rather than
   * dispatching another roam: the action applies a *delta*, so undoing it would mean
   * tracking every zoom and drag since the last rebuild, including the drags this
   * component never saw. `center: null` is ECharts' own "no override".
   */
  it('resets by writing the identity view rather than by another roam', () => {
    const chart = renderControls();

    click('Reset zoom');

    expect(chart.setOption).toHaveBeenCalledWith({ series: [{ zoom: 1, center: null }] });
    expect(chart.dispatchAction).not.toHaveBeenCalled();
  });

  // The ref is `null` before mount and after dispose, and a click can land in between —
  // the panel unmounts while the button still has focus, for instance.
  it('does nothing when the chart is gone', () => {
    const ref = { current: null } as MutableRefObject<EChartsType | null>;
    render(<ChartZoomControls action={action} chartRef={ref} width={400} height={300} />);

    click('Zoom in');
    click('Reset zoom');

    // No throw is the assertion; the buttons are still there to prove the clicks landed.
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
  });
});
