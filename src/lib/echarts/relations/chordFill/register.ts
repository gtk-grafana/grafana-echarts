import { registerUpdateLifecycle } from 'echarts/core';
import { type ChordEdgeItemOption } from 'echarts/types/src/chart/chord/ChordSeries';
import { type Path } from 'echarts/types/src/util/graphic';

const CHORD_FILL_MODES = new Set(['source', 'target', 'gradient']);
const CHORD_EDGE_STATES = ['emphasis', 'blur', 'select'] as const;

/** Apply one literal color to the ribbon and to each interaction state. */
function setRibbonFill(ribbon: Path, color: string): void {
  ribbon.setStyle({ fill: color });
  for (const stateName of CHORD_EDGE_STATES) {
    const state = ribbon.ensureState(stateName);
    state.style = { ...state.style, fill: color };
  }
  ribbon.markRedraw();
}

function isPath(element: unknown): element is Path {
  return (
    typeof element === 'object' &&
    element !== null &&
    'setStyle' in element &&
    typeof element.setStyle === 'function' &&
    'ensureState' in element &&
    typeof element.ensureState === 'function' &&
    'markRedraw' in element &&
    typeof element.markRedraw === 'function'
  );
}

/**
 * Fill chord ribbons after ECharts creates their graphic elements and states.
 *
 * ECharts fills a chord ribbon only for `source`, `target`, and `gradient`.
 * A literal `lineStyle.color` becomes a zero-width stroke and leaves the fill dark.
 * https://github.com/apache/echarts/blob/master/src/chart/chord/ChordEdge.ts
 */
export function registerChordLiteralFill(): void {
  registerUpdateLifecycle('series:afterupdate', (ecModel) => {
    ecModel.eachSeriesByType('chord', (seriesModel) => {
      const edgeData = seriesModel.getData().graph?.edgeData;
      if (edgeData == null) {
        return;
      }
      for (let dataIndex = 0; dataIndex < edgeData.count(); dataIndex++) {
        const edgeModel = edgeData.getItemModel<ChordEdgeItemOption>(dataIndex);
        const color = edgeModel.option.lineStyle?.color;
        const ribbon: unknown = edgeData.getItemGraphicEl(dataIndex);
        if (typeof color === 'string' && !CHORD_FILL_MODES.has(color) && isPath(ribbon)) {
          setRibbonFill(ribbon, color);
        }
      }
    });
  });
}
