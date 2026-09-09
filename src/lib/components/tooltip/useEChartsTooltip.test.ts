import { act, fireEvent, renderHook } from '@testing-library/react';
import { type EChartsType } from 'lib/echarts/echarts';
import { type TooltipModel } from 'lib/echarts/tooltip/types';
import { type RefObject } from 'react';
import { useEChartsTooltip } from './useEChartsTooltip';

const model: TooltipModel = { header: { label: '', value: 'x' }, rows: [{ label: 'A', value: '1' }] };

/** Recorded `dispatchAction` payload, narrowed to the fields these tests assert. */
interface Dispatched {
  type: string;
  seriesIndex?: number;
  dataIndex?: number;
  /** `'node'` / `'edge'` for graph-like series; absent elsewhere. */
  dataType?: string;
}

/**
 * Minimal ECharts stand-in that records handlers and lets tests emit events.
 *
 * The pixel-conversion methods model an identity coordinate system: a cursor at
 * (x, y) reads back as data (x, y), and series `s` places its point for data
 * value `v` at pixel (v, v + s * 100). That keeps the proximity arithmetic in
 * these tests trivial to reason about — the real coordinate maths is covered
 * against a live chart in `lib/echarts/tooltip/proximity.test.ts`.
 */
function createFakeChart({ throwOnIndexedShowTip = false }: { throwOnIndexedShowTip?: boolean } = {}) {
  const zrHandlers: Record<string, Array<(arg: unknown) => void>> = {};
  const chartHandlers: Record<string, Array<(arg: unknown) => void>> = {};
  const dispatched: Dispatched[] = [];
  const zr = {
    on: (event: string, handler: (arg: unknown) => void) => void (zrHandlers[event] ??= []).push(handler),
    off: (event: string, handler: (arg: unknown) => void) => {
      zrHandlers[event] = (zrHandlers[event] ?? []).filter((h) => h !== handler);
    },
  };
  const chart = {
    getZr: () => zr,
    on: (event: string, handler: (arg: unknown) => void) => void (chartHandlers[event] ??= []).push(handler),
    off: (event: string, handler: (arg: unknown) => void) => {
      chartHandlers[event] = (chartHandlers[event] ?? []).filter((h) => h !== handler);
    },
    isDisposed: () => false,
    dispatchAction: (payload: Dispatched) => {
      // Stands in for the parallel coordinate system, where ECharts' own
      // `findPointFromSeries` throws on an index-addressed `showTip`.
      if (throwOnIndexedShowTip && payload.type === 'showTip' && payload.seriesIndex != null) {
        throw new TypeError("Cannot read properties of undefined (reading 'dataToCoord')");
      }
      dispatched.push(payload);
    },
    containPixel: () => true,
    convertFromPixel: (_finder: unknown, point: number[]) => point,
    convertToPixel: (finder: { seriesIndex: number }, value: number[]) => [
      value[0],
      value[1] + finder.seriesIndex * 100,
    ],
  };
  return {
    chart: chart as unknown as EChartsType,
    dispatched,
    emitZr: (event: string, arg?: unknown) => (zrHandlers[event] ?? []).forEach((h) => h(arg)),
    emit: (event: string, arg?: unknown) => (chartHandlers[event] ?? []).forEach((h) => h(arg)),
  };
}

/**
 * Let the emphasis handling run, which it defers to a microtask so that it lands after
 * every handler of the same event — including ECharts' own, which is the one it corrects
 * (see `settleFocus`). Jest's fake timers own the microtask queue along with the clock,
 * so draining it is a tick of zero.
 *
 * Called *inside* the `act` that emits, after all of that event's emissions, since the
 * pair a move between two marks reports is one hover and settles once.
 */
const settle = () => jest.advanceTimersByTime(0);

/** Two flat series whose points sit at y = 10 and y = 110 in fake-chart pixels. */
const proximitySeries = [
  { x: [0, 10, 20], y: [10, 10, 10] },
  { x: [0, 10, 20], y: [10, 10, 10] },
];

// A container positioned at (100, 50) so window coords are offset + this origin.
// A real (attached) element, not a bare stub: the scroll-dismiss handler asks
// whether the scrolled node contains it, which needs a node in the document.
const containerEl = document.createElement('div');
containerEl.getBoundingClientRect = () => ({ left: 100, top: 50 }) as DOMRect;
document.body.appendChild(containerEl);

const containerRef: RefObject<HTMLElement> = { current: containerEl };

describe('useEChartsTooltip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Run the rAF flush synchronously; keep setTimeout (the hide delay) on fake timers.
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows content on sink and tracks the cursor in window coordinates', () => {
    const fake = createFakeChart();
    const { result } = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

    act(() => {
      result.current.reportTrigger('item');
      fake.emitZr('mousemove', { offsetX: 5, offsetY: 8 });
      result.current.sink(model);
    });

    expect(result.current.state.visible).toBe(true);
    expect(result.current.state.model).toEqual(model);
    expect(result.current.state.position).toEqual({ x: 105, y: 58 });
  });

  it('hides immediately on globalout (cursor leaves the canvas)', () => {
    const fake = createFakeChart();
    const { result } = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

    act(() => {
      result.current.sink(model);
    });
    expect(result.current.state.visible).toBe(true);

    act(() => {
      fake.emitZr('globalout');
    });
    expect(result.current.state.visible).toBe(false);
  });

  it('hides an item-triggered tooltip a short delay after mouseout', () => {
    const fake = createFakeChart();
    const { result } = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

    act(() => {
      result.current.reportTrigger('item');
      result.current.sink(model);
      fake.emit('mouseout');
    });
    // Still visible during the grace period.
    expect(result.current.state.visible).toBe(true);

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current.state.visible).toBe(false);
  });

  it('keeps an axis-triggered ("All") tooltip open through mouseout', () => {
    const fake = createFakeChart();
    const { result } = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

    act(() => {
      result.current.reportTrigger('axis');
      result.current.sink(model);
      fake.emit('mouseout');
      jest.advanceTimersByTime(200);
    });

    expect(result.current.state.visible).toBe(true);
  });

  it('pins on element click recording the clicked item, freezes hover, and dismisses on Escape', () => {
    const fake = createFakeChart();
    const { result } = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

    act(() => {
      result.current.reportTrigger('item');
      result.current.sink(model);
      fake.emit('click', { seriesIndex: 2, dataIndex: 5 });
    });
    expect(result.current.state.pinned).toBe(true);
    // The clicked element is recorded so the overlay can pick that row's footer.
    expect(result.current.state.pinnedItem).toEqual({ seriesIndex: 2, dataIndex: 5 });

    // A later hover is ignored while pinned.
    act(() => {
      result.current.sink({ header: { label: '', value: 'other' }, rows: [] });
    });
    expect(result.current.state.model).toEqual(model);

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(result.current.state.pinned).toBe(false);
    expect(result.current.state.pinnedItem).toBeNull();
    expect(result.current.state.visible).toBe(false);
  });

  it('pins from an empty-grid (canvas) click with no recorded item', () => {
    const fake = createFakeChart();
    const { result } = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

    act(() => {
      result.current.reportTrigger('axis');
      result.current.sink(model);
      fake.emitZr('click');
    });
    expect(result.current.state.pinned).toBe(true);
    expect(result.current.state.pinnedItem).toBeNull();
  });

  it('records the element when the canvas click pinned first (same user click)', () => {
    const fake = createFakeChart();
    const { result } = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

    act(() => {
      result.current.reportTrigger('axis');
      result.current.sink(model);
      // ZRender's canvas click and the element-level chart click both fire for
      // a click on an element; order is not guaranteed.
      fake.emitZr('click');
      fake.emit('click', { seriesIndex: 1, dataIndex: 3 });
    });
    expect(result.current.state.pinned).toBe(true);
    expect(result.current.state.pinnedItem).toEqual({ seriesIndex: 1, dataIndex: 3 });
  });

  // A graph-like series (graph / sankey / chord) keeps nodes and edges in two
  // separate data tables, discriminated by `dataType`. ECharts' `showTip` cannot
  // address the edge table — `findPointFromSeries` calls `seriesModel.getData()`
  // with no `dataType` — so replaying a clicked edge resolves the *node* at the
  // same `dataIndex` and pins an unrelated node's tooltip.
  describe('re-pinning onto an edge of a graph-like series', () => {
    const nodeModel: TooltipModel = { header: { label: 'gateway', value: '' }, rows: [{ label: 'Value', value: '7' }] };
    const edgeModel: TooltipModel = {
      header: { label: 'us-west → us-east', value: '' },
      rows: [{ label: 'Value', value: '380' }],
    };

    /**
     * Pin on a node, then hover an edge and click it — the reported sequence.
     * Both items sit at `dataIndex: 2`, which is what makes the bug visible: only
     * `dataType` tells them apart.
     *
     * `dispatched` is emptied after the first pin so assertions see only what the
     * re-pin dispatched — the node pin legitimately replays a `showTip` at that
     * same index.
     */
    const rePinOntoEdge = () => {
      const fake = createFakeChart();
      const view = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

      act(() => {
        view.result.current.reportTrigger('item');
        view.result.current.sink(nodeModel);
        fake.emit('click', { seriesIndex: 0, dataIndex: 2, dataType: 'node' });
      });
      expect(view.result.current.state.pinned).toBe(true);
      fake.dispatched.length = 0;

      act(() => {
        // ECharts keeps hit-testing while the React tooltip is frozen, so the
        // edge's model still reaches the sink even though it is not displayed.
        view.result.current.sink(edgeModel);
        // The outside-click handler unpins on mousedown; the click then re-pins.
        fireEvent.mouseDown(document.body);
        fake.emit('click', { seriesIndex: 0, dataIndex: 2, dataType: 'edge' });
      });
      return { fake, view };
    };

    it('pins the clicked edge, not the node sharing its dataIndex', () => {
      const { view } = rePinOntoEdge();

      expect(view.result.current.state.pinned).toBe(true);
      expect(view.result.current.state.model).toEqual(edgeModel);
      expect(view.result.current.state.pinnedItem).toEqual({ seriesIndex: 0, dataIndex: 2, dataType: 'edge' });
    });

    it('does not replay an edge through showTip, which would resolve the node', () => {
      const { fake } = rePinOntoEdge();

      // No replay at all for an edge: a typed one is ignored by ECharts and an
      // untyped one is the exact dispatch that resolved the wrong node.
      expect(fake.dispatched.filter((d) => d.type === 'showTip')).toEqual([]);
    });

    it('emphasises the edge rather than the node at the same index', () => {
      const { fake } = rePinOntoEdge();

      expect(fake.dispatched).toContainEqual({
        type: 'highlight',
        seriesIndex: 0,
        dataIndex: 2,
        dataType: 'edge',
      });
    });

    // The node path is unchanged: `showTip` can address the main data table, so
    // it still drives the replay that rebuilds content after a re-pin.
    it('still replays through showTip when the clicked item is a node', () => {
      const fake = createFakeChart();
      const view = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

      act(() => {
        view.result.current.reportTrigger('item');
        view.result.current.sink(nodeModel);
        fake.emit('click', { seriesIndex: 0, dataIndex: 1, dataType: 'node' });
      });

      expect(view.result.current.state.pinned).toBe(true);
      // Untyped on purpose: `showTip` ignores `dataType`, and the main data table
      // is the node table, so the bare index pair resolves the right item.
      expect(fake.dispatched).toContainEqual({ type: 'showTip', seriesIndex: 0, dataIndex: 1 });
    });
  });

  /**
   * **Two reported bugs, one owner.** A pinned tooltip freezes its content and position, and
   * its emphasis is part of what it froze — but the cursor kept taking it away, from both
   * directions:
   *
   * - `mouseout` erased the adjacency fade. `bindMouseEvent` routes every element `mouseout`
   *   into `handleGlobalMouseOutForHighDown`, which opens with an unconditional
   *   `allLeaveBlur(api)` and cannot tell an action-driven highlight from a hover one;
   * - `mouseover` moved it onto whatever the cursor entered, so the panel showed one node's
   *   tooltip beside another node's neighbourhood.
   *
   * See `restorePinnedFocus`.
   */
  describe('emphasis while pinned', () => {
    /** Pin item `dataIndex: 2` of the graph's edge table, then clear the dispatch log. */
    const pinAnEdge = () => {
      const fake = createFakeChart();
      const view = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

      act(() => {
        view.result.current.reportTrigger('item');
        view.result.current.sink(model);
        fake.emit('click', { seriesIndex: 0, dataIndex: 2, dataType: 'edge' });
      });
      expect(view.result.current.state.pinned).toBe(true);
      fake.dispatched.length = 0;
      return { fake, view };
    };

    const highlightsOfPin = (fake: ReturnType<typeof createFakeChart>) =>
      fake.dispatched.filter((d) => d.type === 'highlight');

    it('re-applies the pinned item’s highlight when the cursor leaves it', () => {
      const { fake } = pinAnEdge();

      act(() => {
        fake.emit('mouseout');
        settle();
      });

      expect(highlightsOfPin(fake)).toEqual([{ type: 'highlight', seriesIndex: 0, dataIndex: 2, dataType: 'edge' }]);
    });

    // Leaving the canvas is a `mouseout` of whatever element the cursor was on, so the
    // emphasis is cleared there too — and the tooltip stays pinned and on screen.
    it('re-applies it when the cursor leaves the canvas', () => {
      const { fake, view } = pinAnEdge();

      act(() => {
        fake.emitZr('globalout');
        settle();
      });

      expect(highlightsOfPin(fake)).toEqual([{ type: 'highlight', seriesIndex: 0, dataIndex: 2, dataType: 'edge' }]);
      expect(view.result.current.state.pinned).toBe(true);
      expect(view.result.current.state.visible).toBe(true);
    });

    // Nothing to re-assert once the pin is gone: the next hover owns the emphasis, and
    // re-lighting a dismissed item would leave a highlight nobody can clear.
    it('stops re-applying once the tooltip is dismissed', () => {
      const { fake, view } = pinAnEdge();

      act(() => view.result.current.dismiss());
      fake.dispatched.length = 0;
      act(() => {
        fake.emit('mouseout');
        settle();
      });

      expect(highlightsOfPin(fake)).toEqual([]);
    });

    /**
     * Hovering **another** mark must not move the fade onto it. Measured before the fix on a
     * pinned four-node graph: arriving at a non-neighbour from empty space reproduced the
     * *unpinned* hover state exactly, while the tooltip still named the pinned node.
     *
     * The hovered mark is downplayed as well as the pin re-lit: re-lighting alone happens to
     * strip it (`blurSeries` resets every element's state before un-blurring the focus set) but
     * only for a series that sets `emphasis.focus`, which not every family does.
     */
    it('takes the emphasis back when the cursor enters another mark', () => {
      const { fake } = pinAnEdge();

      act(() => {
        fake.emit('mouseover', { seriesIndex: 0, dataIndex: 7, dataType: 'node' });
        settle();
      });

      expect(fake.dispatched).toEqual([
        { type: 'downplay', seriesIndex: 0, dataIndex: 7, dataType: 'node' },
        { type: 'highlight', seriesIndex: 0, dataIndex: 2, dataType: 'edge' },
      ]);
    });

    // Entering the pinned mark itself is not a theft: downplaying it first would drop the very
    // emphasis being restored.
    it('does not downplay the pinned mark when the cursor re-enters it', () => {
      const { fake } = pinAnEdge();

      act(() => {
        fake.emit('mouseover', { seriesIndex: 0, dataIndex: 2, dataType: 'edge' });
        settle();
      });

      expect(fake.dispatched).toEqual([{ type: 'highlight', seriesIndex: 0, dataIndex: 2, dataType: 'edge' }]);
    });

    /**
     * A pin with no item behind it — a proximity click that landed on empty grid — has nothing
     * to re-light, so freezing means stripping what the hover applied rather than restoring
     * anything.
     */
    it('strips the hover emphasis even when the pin carries no item', () => {
      const fake = createFakeChart();
      const view = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

      act(() => {
        view.result.current.reportTrigger('item');
        view.result.current.sink(model);
        fake.emitZr('click');
      });
      expect(view.result.current.state.pinned).toBe(true);
      expect(view.result.current.state.pinnedItem).toBeNull();
      fake.dispatched.length = 0;

      act(() => {
        fake.emit('mouseover', { seriesIndex: 0, dataIndex: 4 });
        settle();
      });

      expect(fake.dispatched).toEqual([{ type: 'downplay', seriesIndex: 0, dataIndex: 4, dataType: undefined }]);
    });

    // Unpinned, the cursor owns the emphasis as it always did.
    it('leaves hover emphasis alone when nothing is pinned', () => {
      const fake = createFakeChart();
      renderHook(() => useEChartsTooltip(fake.chart, containerRef));

      act(() => {
        fake.emit('mouseover', { seriesIndex: 0, dataIndex: 4 });
        settle();
      });

      expect(fake.dispatched).toEqual([]);
    });
  });

  describe('scroll while pinned', () => {
    const pin = () => {
      const fake = createFakeChart();
      const view = renderHook(() => useEChartsTooltip(fake.chart, containerRef));
      act(() => {
        view.result.current.sink(model);
        fake.emitZr('click');
      });
      expect(view.result.current.state.pinned).toBe(true);
      return view;
    };

    // The pin is what mounts the data-link footer, so a coordinate system whose
    // `showTip` ECharts cannot resolve by index would otherwise have no data
    // links at all — the failure reported against parallel coordinates. The
    // hover that preceded the click already supplied the content, so the throw
    // must not take the pin down with it.
    it('still pins when ECharts throws on the indexed showTip replay', () => {
      const fake = createFakeChart({ throwOnIndexedShowTip: true });
      const view = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

      act(() => {
        view.result.current.sink(model);
        fake.emit('click', { seriesIndex: 0, dataIndex: 1 });
      });

      expect(view.result.current.state.pinned).toBe(true);
      expect(view.result.current.state.pinnedItem).toEqual({ seriesIndex: 0, dataIndex: 1 });
      // The emphasis still lands, so the pinned line stays highlighted.
      expect(fake.dispatched).toContainEqual({ type: 'highlight', seriesIndex: 0, dataIndex: 1 });
    });

    it('dismisses when an ancestor of the chart scrolls', () => {
      const { result } = pin();

      // The chart container is a child of document, so a document scroll moves
      // it — the pinned tooltip no longer points at its datapoint.
      act(() => {
        document.dispatchEvent(new Event('scroll', { bubbles: false }));
      });

      expect(result.current.state.pinned).toBe(false);
      expect(result.current.state.visible).toBe(false);
    });

    it('ignores scrolling inside the tooltip itself', () => {
      const { result } = pin();
      // A scrollable Multi-mode tooltip body: scrolling it must not close it.
      const inner = document.createElement('div');
      document.body.appendChild(inner);

      act(() => {
        inner.dispatchEvent(new Event('scroll', { bubbles: false }));
      });

      expect(result.current.state.pinned).toBe(true);
      inner.remove();
    });
  });

  describe('proximity mode', () => {
    const renderProximity = (fake: ReturnType<typeof createFakeChart>) =>
      renderHook(() => useEChartsTooltip(fake.chart, containerRef, { series: proximitySeries }));

    /** Cursor at data x=10; series 0's point is at y=10, series 1's at y=110. */
    const moveTo = (fake: ReturnType<typeof createFakeChart>, x: number, y: number) =>
      fake.emitZr('mousemove', { offsetX: x, offsetY: y });

    it('replays the focused point into ECharts and emphasises it', () => {
      const fake = createFakeChart();
      const { result } = renderProximity(fake);

      act(() => moveTo(fake, 10, 12));

      expect(fake.dispatched).toEqual([
        { type: 'highlight', seriesIndex: 0, dataIndex: 1 },
        { type: 'showTip', seriesIndex: 0, dataIndex: 1 },
      ]);
      expect(result.current.state.activeSeriesIndex).toBe(0);
    });

    it('moves the emphasis off the old point when the focus changes', () => {
      const fake = createFakeChart();
      renderProximity(fake);

      act(() => moveTo(fake, 10, 12));
      fake.dispatched.length = 0;
      // Nearer to series 1's point (y=110) than to series 0's (y=10).
      act(() => moveTo(fake, 10, 108));

      expect(fake.dispatched).toEqual([
        { type: 'downplay', seriesIndex: 0, dataIndex: 1 },
        { type: 'highlight', seriesIndex: 1, dataIndex: 1 },
        { type: 'showTip', seriesIndex: 1, dataIndex: 1 },
      ]);
    });

    it('does not re-dispatch while the cursor stays on the same point', () => {
      const fake = createFakeChart();
      renderProximity(fake);

      act(() => moveTo(fake, 10, 12));
      fake.dispatched.length = 0;
      act(() => moveTo(fake, 11, 14));

      expect(fake.dispatched).toEqual([]);
    });

    it('clears the emphasis when nothing is within the focus band', () => {
      const fake = createFakeChart();
      const { result } = renderProximity(fake);

      act(() => moveTo(fake, 10, 12));
      fake.dispatched.length = 0;
      // Half way between the two series: outside the 30px band of either.
      act(() => moveTo(fake, 10, 60));

      expect(fake.dispatched).toEqual([{ type: 'downplay', seriesIndex: 0, dataIndex: 1 }]);
      expect(result.current.state.activeSeriesIndex).toBeNull();
      expect(result.current.state.visible).toBe(false);
    });

    it('freezes the emphasis on the pinned point, ignoring later moves', () => {
      const fake = createFakeChart();
      const { result } = renderProximity(fake);

      act(() => {
        moveTo(fake, 10, 12);
        result.current.sink(model);
      });
      act(() => fake.emitZr('click'));
      expect(result.current.state.pinned).toBe(true);
      // An empty-grid click reports no element, so the pinned item comes from the
      // proximity hit — which is also what the footer resolves against.
      expect(result.current.state.pinnedItem).toEqual({ seriesIndex: 0, dataIndex: 1 });

      fake.dispatched.length = 0;
      // Moving onto the other series must not steal the emphasis while pinned.
      act(() => moveTo(fake, 10, 108));

      expect(fake.dispatched).toEqual([]);
      expect(result.current.state.activeSeriesIndex).toBe(0);
    });

    it('releases the emphasis on dismiss', () => {
      const fake = createFakeChart();
      const { result } = renderProximity(fake);

      act(() => {
        moveTo(fake, 10, 12);
        result.current.sink(model);
      });
      act(() => fake.emitZr('click'));
      fake.dispatched.length = 0;

      act(() => result.current.dismiss());

      expect(fake.dispatched).toEqual([{ type: 'downplay', seriesIndex: 0, dataIndex: 1 }]);
      expect(result.current.state.activeSeriesIndex).toBeNull();
    });

    it('tracks the active series without driving visibility in axis (All) mode', () => {
      const fake = createFakeChart();
      const { result } = renderProximity(fake);

      act(() => {
        result.current.reportTrigger('axis');
        result.current.sink(model);
        moveTo(fake, 10, 12);
      });

      // The focused point is emphasised, but ECharts owns the content in axis
      // mode, so no `showTip` is replayed.
      expect(fake.dispatched).toEqual([{ type: 'highlight', seriesIndex: 0, dataIndex: 1 }]);
      expect(result.current.state.activeSeriesIndex).toBe(0);

      // Leaving the focus band drops the emphasis but keeps the All tooltip up.
      act(() => moveTo(fake, 10, 60));
      expect(result.current.state.activeSeriesIndex).toBeNull();
      expect(result.current.state.visible).toBe(true);
    });
  });
});
