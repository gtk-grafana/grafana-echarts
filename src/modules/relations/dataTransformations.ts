import { debug, LOG_LEVELS } from 'development';
import { deriveNodesOperator } from 'lib/echarts/relations/converters/deriveNodes';

import { isLegacyGraphFrames, legacyToWideOperator } from 'lib/echarts/relations/converters/legacyToWide';
import { isLongGraphFrames, longToWideOperator } from 'lib/echarts/relations/converters/longToWide';
import { type SystemTransformationsSupplier } from 'lib/grafana/panelDataTransformations';

import { isGraphWideFrames } from 'lib/echarts/relations/converters/frameRoles';
/**
 * Converts supported graph shapes to wide frames, then adds missing nodes.
 * Test long frames first because they also match the wide edge shape.
 */
export const relationsDataTransformations: SystemTransformationsSupplier = ({ series }) => {
  debug('relationsDataTransformations', LOG_LEVELS.debug, { series });
  if (isLongGraphFrames(series)) {
    return [longToWideOperator, deriveNodesOperator];
  }
  if (isGraphWideFrames(series)) {
    return [deriveNodesOperator];
  }
  return isLegacyGraphFrames(series) ? [legacyToWideOperator, deriveNodesOperator] : [];
};
