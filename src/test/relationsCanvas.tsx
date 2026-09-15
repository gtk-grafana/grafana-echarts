import { type DataFrame, type FieldConfigSource } from '@grafana/data';
import { render } from '@testing-library/react';

import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';
import { deriveNodes } from 'lib/echarts/relations/converters/deriveNodes';
import { legacyToWide } from 'lib/echarts/relations/converters/legacyToWide';
import { SERIES_ZLEVEL } from 'test/canvas';
import { getComponent, getSeriesCanvasEvents } from 'test/panel';
import { type PanelOptions } from 'types';

import { type EChartsRelationsFieldConfig } from 'editor/relations/types';
/** Render harness shared by the relations canvas and integration suites. */

export type RelationsVariant = 'graph' | 'sankey' | 'chord';

/** The pipeline prefix a fixture is put through before it reaches the panel. */
export type PipelinePrefix = (frames: DataFrame[]) => DataFrame[];

/** Fixtures are written in Grafana's row form. */
export const asPipelineWould: PipelinePrefix = (frames) => deriveNodes(legacyToWide(frames));

export const canvasOptions = (extra: Partial<PanelOptions> = {}): Partial<PanelOptions> => ({
  zLevel: { series: SERIES_ZLEVEL },
  animation: { enabled: false },
  editorMode: 'advanced',
  relationsLayout: 'circular',
  ...extra,
});

interface RenderRelationsInput<FieldConfig> {
  frames: DataFrame[];
  /** Defaults to `graph`. Sankey and chord self-layout, so both drop `relationsLayout`. */
  variant?: RelationsVariant;
  options?: Partial<PanelOptions>;
  fieldConfig?: FieldConfigSource<FieldConfig>;
  /** The pipeline prefix to run the fixture through. */
  prefix?: PipelinePrefix;
}

/** Render one relations variant and return its canvas events. */
export const renderRelations = async ({
  frames,
  variant = 'graph',
  options = {},
  fieldConfig,
  prefix = asPipelineWould,
}: RenderRelationsInput<EChartsRelationsFieldConfig>) => {
  const merged = canvasOptions(options);
  const { container } = render(
    getComponent(
      prefix(frames),
      variant,
      variant === 'graph' ? merged : { ...merged, relationsLayout: undefined },
      undefined,
      undefined,
      'relations',
      fieldConfig
    )
  );
  // Some integration tests also inspect React controls.
  return { ...(await getSeriesCanvasEvents(container)), container };
};

/** The text of every label actually painted, so a label test can assert what was drawn rather than only pin it. */
export const labelTexts = (events: CanvasRenderingContext2DEvent[]): string[] =>
  events.filter((event) => event.type === 'fillText').map((event) => String(event.props.text));

/** Return sorted unique labels. */
export const uniqueLabelTexts = (events: CanvasRenderingContext2DEvent[]): string[] =>
  [...new Set(labelTexts(events))].sort();

/** Every label drawn since `from`, in canvas coordinates. */
export const labelPositions = (events: CanvasRenderingContext2DEvent[], from = 0) =>
  events.slice(from).flatMap((event) => {
    if (event.type !== 'fillText') {
      return [];
    }
    const { text, x, y } = event.props as unknown as { text: string; x: number; y: number };
    // Apply the recorded zrender transform to each label offset.
    const [a, b, c, d, e, f] = (event as unknown as { transform: number[] }).transform;
    return [{ text: String(text), x: a * x + c * y + e, y: b * x + d * y + f }];
  });
