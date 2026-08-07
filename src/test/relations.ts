import { createTheme, type DataFrame, dateTime, type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { LegendDisplayMode, SortOrder, TooltipDisplayMode } from '@grafana/schema';
import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { type NodeGraphData } from 'lib/echarts/converters/relationsModel';
import { type RelationsSeriesContext } from 'lib/echarts/options/graph';
import { type RelationsLinkItem, type RelationsNodeItem } from 'lib/echarts/tooltip/types';
import { type EChartsFrame } from 'lib/grafana/types';
import { type PanelOptions } from 'types';

/**
 * Shared fixtures for the relations family's unit and canvas suites.
 *
 * The context builder here is **typed**: it returns a real `RelationsChartContext`
 * rather than an object cast through `unknown`. That is the point of it — the three
 * option suites each carried their own double-cast preamble, and a double cast makes
 * a fixture that has drifted from the interface (a renamed key, a field the context
 * no longer has) compile anyway, so the test goes green against a shape the panel
 * can never be handed.
 *
 * The canvas/integration harness that renders these frames through a real `<Panel />`
 * lives next door in `test/relationsCanvas.tsx`; it reads its frames from here so the
 * two halves of the family's coverage describe the same graph.
 */

export const relationsTheme = createTheme();

export const emptyFieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

/**
 * Panel options with the two keys every relations context needs. `legend` and
 * `tooltip` are non-optional on `PanelOptions`, so they are supplied rather than cast
 * away; everything else is genuinely optional and left unset.
 */
export const relationsOptions = (extra: Partial<PanelOptions> = {}): PanelOptions => ({
  legend: { showLegend: true, displayMode: LegendDisplayMode.List, placement: 'bottom', calcs: [] },
  tooltip: { mode: TooltipDisplayMode.Single, sort: SortOrder.None },
  ...extra,
});

interface RelationsContextInput {
  /** Frames as the panel receives them: wide, and with field overrides already applied. */
  frames?: DataFrame[];
  options?: PanelOptions;
  seriesType?: RelationsChartContext['seriesType'];
  fieldConfig?: FieldConfigSource;
}

/**
 * A relations chart context with no cast through `unknown`.
 *
 * `frames` is asserted to `EChartsFrame[]` and nothing else: `toDataFrame` returns a
 * `DataFrame` whose fields carry the open `FieldConfig`, and narrowing that to the
 * plugin's `EChartsFieldConfig` is the one thing a fixture cannot express structurally.
 * Every other key is checked, which is what makes a drifted fixture fail to compile.
 */
export const relationsContext = ({
  frames = [],
  options = relationsOptions(),
  seriesType = 'graph',
  fieldConfig = emptyFieldConfig,
}: RelationsContextInput = {}): RelationsChartContext => ({
  frames: frames as EChartsFrame[],
  theme: relationsTheme,
  timeZone: 'utc',
  timeRange: {
    from: dateTime(1783137094497),
    to: dateTime(1783147894497),
    raw: { from: 'now-3h', to: 'now' },
  },
  options,
  seriesType,
  formatValue: (value) => ({ text: String(value) }),
  fieldConfig,
  replaceVariables: (value) => value,
});

/** The same context as the series builders see it, with the per-mark lookup left off. */
export const relationsSeriesContext = (input: RelationsContextInput = {}): RelationsSeriesContext =>
  relationsContext(input);

/**
 * The node/link model the three variants share, as the converter produces it.
 * Colours are supplied by callers that assert on them — a mark reaches this layer
 * already coloured, because its own display processor decided the colour upstream
 * in `converters/graphWide.ts`.
 */
export const nodeGraph = (extra: Partial<NodeGraphData> = {}): NodeGraphData => ({
  nodes: [
    { id: 'a', name: 'A', value: 1 },
    { id: 'b', name: 'B', value: 2 },
  ],
  links: [{ id: 'e1', source: 'a', target: 'b', value: 5 }],
  ...extra,
});

/** A built series' node items, typed for assertions. */
export const nodeItems = (series: { data?: unknown }): RelationsNodeItem[] => series.data as RelationsNodeItem[];

/** A built series' link items, typed for assertions. */
export const linkItems = (series: { links?: unknown }): RelationsLinkItem[] => series.links as RelationsLinkItem[];

// --- Row-form frames -------------------------------------------------------
//
// Written in Grafana's row form because that is what a datasource emits. The canvas
// harness runs them through the same conversion the host does (`asPipelineWould`);
// unit suites that want the wide form call `legacyToWide` themselves.

/** A small service graph: gateway fans out to api and web, both of which call db. */
export const nodesFrame = toDataFrame({
  name: 'nodes',
  fields: [
    { name: 'id', type: FieldType.string, values: ['gateway', 'api', 'web', 'db'] },
    { name: 'title', type: FieldType.string, values: ['Gateway', 'API', 'Web', 'DB'] },
    { name: 'mainstat', type: FieldType.number, values: [120, 80, 60, 200] },
  ],
});

export const edgesFrame = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: ['e1', 'e2', 'e3', 'e4'] },
    { name: 'source', type: FieldType.string, values: ['gateway', 'gateway', 'api', 'web'] },
    { name: 'target', type: FieldType.string, values: ['api', 'web', 'db', 'db'] },
    { name: 'mainstat', type: FieldType.number, values: [100, 50, 90, 40] },
  ],
});

/**
 * The same edges plus `db -> gateway`, which closes a cycle. ECharts' sankey layout
 * throws on one — in production too, since the throw is not `__DEV__`-guarded — so
 * this is the fixture the family's cycle policy exists for.
 *
 * Weights differ from the acyclic set deliberately: with matching weights the four
 * surviving links would draw the base render exactly, and a sankey snapshot of it
 * would duplicate that baseline instead of pinning this one.
 */
export const cyclicEdgesFrame = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: ['e1', 'e2', 'e3', 'e4', 'e5'] },
    { name: 'source', type: FieldType.string, values: ['gateway', 'gateway', 'api', 'web', 'db'] },
    { name: 'target', type: FieldType.string, values: ['api', 'web', 'db', 'db', 'gateway'] },
    { name: 'mainstat', type: FieldType.number, values: [70, 30, 65, 25, 15] },
  ],
});

/** The same four nodes with server-supplied coordinates, which selects `layout: 'none'`. */
export const pinnedNodesFrame = toDataFrame({
  name: 'nodes',
  fields: [
    { name: 'id', type: FieldType.string, values: ['gateway', 'api', 'web', 'db'] },
    { name: 'title', type: FieldType.string, values: ['Gateway', 'API', 'Web', 'DB'] },
    { name: 'mainstat', type: FieldType.number, values: [120, 80, 60, 200] },
    { name: 'fixedx', type: FieldType.number, values: [50, 150, 150, 250] },
    { name: 'fixedy', type: FieldType.number, values: [150, 80, 220, 150] },
  ],
});

/**
 * Twelve nodes whose titles are long enough that neighbouring label boxes genuinely
 * intersect under the harness metric, plus a chain of edges through them.
 *
 * `jest-canvas-mock`'s `TextMetrics` reports `width = text.length` — one pixel per
 * character — so at the real 120px default label width a 30-character name measures 30
 * and nothing ever truncates or collides. The mechanism is identical either way; only
 * the scale differs, so the fixture and the widths beside it pick numbers that reach it.
 */
export const crowdedIds = [
  'gateway',
  'api',
  'web',
  'db',
  'cache',
  'queue',
  'search',
  'auth',
  'billing',
  'notify',
  'audit',
  'report',
];

export const crowdedNodesFrame = toDataFrame({
  name: 'nodes',
  fields: [
    { name: 'id', type: FieldType.string, values: crowdedIds },
    {
      name: 'title',
      type: FieldType.string,
      values: crowdedIds.map((id) => `${id}-service-primary-eu-west-1-with-a-name-that-keeps-going`),
    },
    { name: 'mainstat', type: FieldType.number, values: crowdedIds.map((_, index) => 20 + index * 15) },
  ],
});

export const crowdedEdgesFrame = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: crowdedIds.slice(1).map((_, index) => `e${index}`) },
    { name: 'source', type: FieldType.string, values: crowdedIds.slice(0, -1) },
    { name: 'target', type: FieldType.string, values: crowdedIds.slice(1) },
    { name: 'mainstat', type: FieldType.number, values: crowdedIds.slice(1).map((_, index) => 10 + index * 5) },
  ],
});

/**
 * Two links between the same pair of nodes, which a response can perfectly well
 * contain (two call paths between the same services) and which is drawn as one line
 * over another — so the two edge values land on exactly the same spot and collide
 * whatever the text measures. `c` is a third node touching neither of them, so "the
 * node the label belongs to" is a claim with a counter-example.
 *
 * A reciprocal pair (`a->b` with `b->a`) is deliberately *not* used: those two labels
 * sit on opposite sides of the shared line, 10px apart, because the second is rotated
 * by a further 180 degrees. They do collide at real font sizes, and not at this one.
 */
export const overlappingNodesFrame = toDataFrame({
  name: 'nodes',
  fields: [
    { name: 'id', type: FieldType.string, values: ['a', 'b', 'c'] },
    { name: 'mainstat', type: FieldType.number, values: [1, 2, 3] },
  ],
});

export const overlappingEdgesFrame = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: ['one', 'two', 'three'] },
    { name: 'source', type: FieldType.string, values: ['a', 'a', 'b'] },
    { name: 'target', type: FieldType.string, values: ['b', 'b', 'c'] },
    { name: 'mainstat', type: FieldType.number, values: [11, 22, 33] },
  ],
});

/** The two edge weights that collide in `overlappingEdgesFrame`. */
export const overlappingValues = ['11', '22'];

/**
 * Twelve chord nodes, four carrying real flow and eight reduced to slivers — the exact
 * shape "Hide overlapping labels" exists for on a ring, since the slivers collapse into
 * a narrow wedge and their labels stack on one another.
 */
export const ringIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

export const ringNodesFrame = toDataFrame({
  name: 'nodes',
  fields: [
    { name: 'id', type: FieldType.string, values: ringIds },
    { name: 'title', type: FieldType.string, values: ringIds.map((id) => `${id}-service-primary-eu-west-1`) },
  ],
});

export const ringEdgesFrame = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: ringIds.map((_, index) => `e${index}`) },
    { name: 'source', type: FieldType.string, values: ringIds },
    { name: 'target', type: FieldType.string, values: [...ringIds.slice(1), ringIds[0]] },
    { name: 'mainstat', type: FieldType.number, values: ringIds.map((_, index) => (index < 4 ? 200 : 1)) },
  ],
});
