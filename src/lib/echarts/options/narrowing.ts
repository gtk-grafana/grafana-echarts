import { type ZRRectLike } from 'echarts/types/src/util/types';

/**
 * Narrow eCharts params.coordSys which are only exposed as `{ type: string }`
 * @todo open upstream issue in https://github.com/apache/echarts
 */
export function isRect(value: unknown): value is ZRRectLike {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    'x' in value &&
    typeof value.x === 'number' &&
    'y' in value &&
    typeof value.y === 'number' &&
    'width' in value &&
    typeof value.width === 'number' &&
    'height' in value &&
    typeof value.height === 'number'
  );
}
