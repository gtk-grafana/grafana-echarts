import { type DataFrame, type GrafanaTheme2, type ReduceDataOptions } from '@grafana/data';
import { debug, LOG_LEVELS } from 'development';
import { resolveEndpointLabelKeys, resolveGraphWideRoles } from 'lib/echarts/relations/converters/frameRoles';
import { type MarkRead, normalizeRelationsCalcs } from 'lib/echarts/relations/converters/markRead';
import { type NodeGraphData, type RelationLink } from 'lib/echarts/relations/converters/model';
import { assignMarkKeys, readLinks } from 'lib/echarts/relations/converters/readEdges';
import { deriveNodesFromLinks, fillPaletteColors, readNodeFrames } from 'lib/echarts/relations/converters/readNodes';
import { isTimelessFrame, rowAt } from 'lib/echarts/relations/converters/timeStops';

/**
 * Reader for the field-based graph contract: **one node is one field, one edge is one
 * field**. Identity is `field.name`, topology is in `field.labels`, and everything else
 * — colour, unit, decimals, links, per-mark style — is ordinary `fieldConfig`.
 *
 * Spec: ../../../../../data-plane/graph-wide.md. This is the family's only reader; the
 * row-based format is converted to this one above the panel (`legacyToWide.ts`).
 *
 * The payoff is that every mark is an override target, because a field is the unit
 * Grafana's whole configuration pipeline already addresses. That only pays off when the
 * frames were made wide **above** the panel, before `applyFieldOverrides`.
 *
 * **A role is one-to-many.** Every frame that passes the shape test contributes its
 * marks, not just the first — the contract's *Multi* row-dimension variant, and the shape
 * any labelled datasource returns without transformation (N frames of `[Time, Value]`,
 * endpoints on each `Value`). The single-frame reading drew a one-edge graph from a
 * ten-series response with no error anywhere, and it could not be fixed above the panel:
 * the conversion prefix is feature-detected *and* gated behind `panelPluginTransformations`,
 * which is off by default (`lib/grafana/panelDataTransformations.ts`), so on a stock host
 * the reader is the entire data path. Two edges frames from two queries are also something
 * no core transformation can union.
 *
 * What the prefix still buys is **identity**, not topology: only a transformation running
 * before `applyFieldOverrides` can turn a model id into a real `field.name`, i.e. into
 * something a `byName` override, the override picker and the legend can address. N raw
 * frames whose value field is called `Value` are N marks with one id — see
 * {@link assignMarkKeys} for the one thing that actually breaks, and the contract's
 * *Identity* section for what stays lost.
 */

/**
 * Note how many edges the response would have lost under the single-frame reading.
 *
 * The collection is invisible — no notice, no Transform tab entry — so the one case where
 * behaviour changed against a real response has to be legible somewhere. Info rather than
 * warn: collecting them all *is* the contract.
 */
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

/**
 * Report the endpoint keys the reader **recovered** rather than read.
 *
 * The recovery is invisible otherwise — nothing renders differently and the buttons only
 * appear on a pinned tooltip — so a panel whose filters resolve to a key the user did not
 * configure has to be inspectable rather than guessed at. One line per distinct pair, since
 * a multi-level flow's whole point is that there is more than one.
 *
 * Info rather than warn: recovering the key *is* the intended path for these queries.
 */
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

/**
 * Convert `graph-*-wide` frames into the shared node/link model.
 *
 * At least one edges frame is required; nodes frames are optional and only add metadata.
 * Every frame in a role contributes — see {@link resolveGraphWideRoles}. Nodes referenced
 * by an edge but absent from the nodes frames are appended, so a partial nodes frame does
 * not drop edges.
 *
 * `at` selects **one timestamp** instead of reducing: every mark reads the value on its
 * own frame's row for that instant, and `null` where the frame has no sample there — the
 * same thing an all-null field reduces to, so an edge still draws weightless rather than
 * vanishing and the topology stays stable while scrubbing. Omit it for the reducing
 * reading, which is the default and what an instant response can only do.
 *
 * Returns `null` when no usable graph can be derived, so callers fall back to the
 * no-data view.
 */
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
  // The reading, resolved per frame — see {@link MarkRead}. Under `reduce` each mark
  // reduces over its **own** rows, however ragged: reducers skip nulls, so a raw series and
  // the same series null-padded onto a shared row grid give the same number. Under `at` the
  // timestamp is resolved against each frame's own row dimension, for the same reason.
  //
  // **A timeless frame keeps reducing**, whatever `at` says — it has no row to select by
  // time, so its marks read the same at every stop. See {@link isTimelessFrame}, which is
  // also where the bug this closes is written down. Reducing is exact rather than a guess:
  // such a frame carries no rows or one, and every reducer agrees on a single row.
  const readFor = (frame: DataFrame): MarkRead =>
    at == null || isTimelessFrame(frame) ? { kind: 'reduce', calcs } : { kind: 'at', row: rowAt(frame, at) };
  // Per frame first, so the diagnostic can say what the old reading would have drawn.
  // Which edges had their filter keys *recovered* rather than read, for the diagnostic —
  // tracked here rather than on the link, which is the render model and not a log.
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
  // Empty when no frame took the nodes role, which leaves the append below to fill the
  // list from the endpoints alone — the edges-only response.
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
  // Resolved here rather than in the tooltip because this is where the frames are: the
  // model is what every render variant and the tooltip see, and neither gets the response.
  const endpointLabels = resolveEndpointLabelKeys(roles.edgesFrames);
  return { nodes, links, ...(endpointLabels ? { endpointLabels } : {}) };
}
