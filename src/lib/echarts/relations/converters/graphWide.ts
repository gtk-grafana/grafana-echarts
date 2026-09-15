import { type DataFrame, type GrafanaTheme2, type ReduceDataOptions } from '@grafana/data';
import { debug, LOG_LEVELS } from 'development';
import { resolveEndpointLabelKeys, resolveGraphWideRoles } from 'lib/echarts/relations/converters/frameRoles';
import { type MarkRead, normalizeRelationsCalcs } from 'lib/echarts/relations/converters/markRead';
import { type NodeGraphData, type RelationLink } from 'lib/echarts/relations/converters/model';
import { assignMarkKeys, readLinks } from 'lib/echarts/relations/converters/readEdges';
import { deriveNodesFromLinks, fillPaletteColors, readNodeFrames } from 'lib/echarts/relations/converters/readNodes';
import { isTimelessFrame, rowAt } from 'lib/echarts/relations/converters/timeStops';

/** Reader for the field-based graph contract: one node is one field, one edge is one field. */

/** Note how many edges the response would have lost under the single-frame reading. */
function noteCollectedFrames(perFrame: RelationLink[][]): void {
  if (perFrame.length < 2) {
    return;
  }
  const total = perFrame.reduce((sum, links) => sum + links.length, 0);
  debug(
    `Note: relations read ${total} edge(s) from ${perFrame.length} edges frames. ` +
      `Reading the first frame only — what the panel did before — would have drawn ${perFrame[0].length}.`,
    LOG_LEVELS.info,
    { frames: perFrame.length, edges: total, lost: total - perFrame[0].length }
  );
}

/** Report the endpoint keys the reader recovered rather than read. */
function noteRecoveredKeys(links: RelationLink[], recovered: ReadonlySet<RelationLink>): void {
  if (recovered.size === 0) {
    return;
  }
  const pairs = new Map<string, number>();
  for (const link of links) {
    if (!recovered.has(link) || !link.filterLabels) {
      continue;
    }
    const pair = `${link.filterLabels.source} / ${link.filterLabels.target}`;
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  debug(
    `Note: relations recovered the datasource's endpoint label keys by value for ${recovered.size} of ` +
      `${links.length} edge(s): ${[...pairs].map(([pair, count]) => `${pair} (${count})`).join(', ')}. ` +
      'Ad-hoc filters are written under those rather than under the contract’s source/target.',
    LOG_LEVELS.info,
    { pairs: [...pairs.keys()], recovered: recovered.size, edges: links.length }
  );
}

/** Convert `graph-*-wide` frames into the shared node/link model. */
export function frameToGraphWide(
  frames: DataFrame[],
  theme: GrafanaTheme2,
  reduceOptions?: ReduceDataOptions,
  at?: number | null
): NodeGraphData | null {
  const roles = resolveGraphWideRoles(frames);
  if (!roles) {
    return null;
  }

  const calcs = normalizeRelationsCalcs(reduceOptions);
  // Resolve time rows per frame. Timeless frames always use reducers.
  const readFor = (frame: DataFrame): MarkRead =>
    at == null || isTimelessFrame(frame) ? { kind: 'reduce', calcs } : { kind: 'at', row: rowAt(frame, at) };
  // Keep per-frame results for diagnostics.
  const recovered = new Set<RelationLink>();
  const perFrame = roles.edgesFrames.map((frame) => readLinks(frame, readFor(frame), recovered));
  const links = perFrame.flat();
  if (links.length === 0) {
    return null;
  }
  noteCollectedFrames(perFrame);
  noteRecoveredKeys(links, recovered);
  assignMarkKeys(links);

  const derived = deriveNodesFromLinks(links);
  const nodes = readNodeFrames(roles.nodesFrames, readFor);

  // Append any endpoint the nodes frames did not declare. Without this an edge to an
  // unlisted node would be dropped by ECharts, which resolves links by node id.
  const known = new Set(nodes.map((node) => node.id));
  for (const node of derived) {
    if (!known.has(node.id)) {
      nodes.push(node);
      known.add(node.id);
    }
  }

  if (nodes.length === 0) {
    return null;
  }

  fillPaletteColors(nodes, theme);
  // Preserve endpoint labels for tooltip filters.
  const endpointLabels = resolveEndpointLabelKeys(roles.edgesFrames);
  return { nodes, links, ...(endpointLabels ? { endpointLabels } : {}) };
}
