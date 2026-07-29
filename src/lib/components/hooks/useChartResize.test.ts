import { renderHook } from '@testing-library/react';
import { type EChartsType } from 'lib/echarts/echarts';
import { useChartResize } from './useChartResize';

/** Records the sizes pushed to `resize`; that is the whole surface this hook uses. */
function createFakeChart() {
  const resized: Array<{ width: number; height: number }> = [];
  return {
    chart: { resize: (size: { width: number; height: number }) => void resized.push(size) } as unknown as EChartsType,
    resized,
  };
}

describe('useChartResize', () => {
  it('pushes the allocated size to the instance', () => {
    const { chart, resized } = createFakeChart();

    renderHook(() => useChartResize(chart, 400, 300));

    expect(resized).toEqual([{ width: 400, height: 300 }]);
  });

  it('resizes again when the allocated box changes', () => {
    const { chart, resized } = createFakeChart();
    const { rerender } = renderHook(({ w, h }) => useChartResize(chart, w, h), {
      initialProps: { w: 400, h: 300 },
    });

    rerender({ w: 500, h: 300 });

    expect(resized).toEqual([
      { width: 400, height: 300 },
      { width: 500, height: 300 },
    ]);
  });

  it('does not resize when re-rendered at the same size', () => {
    const { chart, resized } = createFakeChart();
    const { rerender } = renderHook(({ w, h }) => useChartResize(chart, w, h), {
      initialProps: { w: 400, h: 300 },
    });

    rerender({ w: 400, h: 300 });

    // ECharts' resize relayouts and repaints, so a no-op call is not free.
    expect(resized).toHaveLength(1);
  });

  it('does nothing before the instance exists', () => {
    // The instance is created in a layout effect, so the first render sees null.
    expect(() => renderHook(() => useChartResize(null, 400, 300))).not.toThrow();
  });
});
