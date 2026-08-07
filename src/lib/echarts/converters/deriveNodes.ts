// Root specifier deliberately: `rxjs` is an exact-string webpack external
// (`.config/bundler/externals.ts`), so `rxjs/operators` would be bundled instead of
// taken from the host.
import { type CustomTransformOperator, type DataFrame, type Field, FieldType } from '@grafana/data';
import { debug, LOG_LEVELS } from 'development';
import { endpointNames, resolveGraphWideRoles } from 'lib/echarts/converters/graphWide';
import { nodesWideFrame } from 'lib/echarts/converters/toGraphWide';
import { type RelationsFamilyField } from 'lib/grafana/fields/fieldTypes';
import { map } from 'rxjs';

/**
 * Give the nodes an edges-only response only *implies* a **field**, before field overrides
 * are applied.
 *
 * The wide contract lets a response carry edges alone: the node set is then the union of
 * the edges' endpoints (../../../../data-plane/graph-wide.md). The reader has always
 * honoured that — `deriveNodesFromLinks` (`graphWide.ts`) invents a node for every endpoint
 * no nodes frame declares — but a node invented *inside* the panel arrives after
 * `applyFieldOverrides` has already run, so it has no field of its own. A mark with no
 * field is a mark Grafana's configuration pipeline cannot address at all: no colour mode,
 * no unit, no `nodeRadius`, no `subtitle`, no data links, no per-mark hide. It is the one
 * thing the whole `graph-*-wide` migration did not buy, and it is the *common* case for
 * time series, because `longToWide.ts` pivots edges only — a `sum by (source, target)`
 * response therefore draws a graph whose entire node set is unconfigurable.
 *
 * This is that same derivation, moved **above** the panel, where a field can still be
 * created. Sibling of `legacyToWide.ts` and `longToWide.ts`, registered in the same prefix
 * (`modules/relations/dataTransformations.ts`) and sharing their construction
 * (`toGraphWide.ts`); unlike them it claims no response of its own, it completes whatever
 * the others left. Background: ../../../../docs/relations-derived-nodes.md.
 *
 * **The reader's derivation stays**, and stays the fallback: the host gates panel-registered
 * transformations behind `grafana.panelPluginTransformations`, off by default, so on a stock
 * host this never runs and the panel must still draw. The two paths are kept in step by
 * sharing `endpointNames` — same node set, same order, therefore the same palette colours
 * either way. What the pre-pass adds is configurability, not nodes.
 *
 * Deliberately theme-free and synchronous, like both siblings: it runs inside the host's rx
 * pipeline, where no theme is in scope and `field.display` does not exist yet.
 */

const numericFields = (frame: DataFrame): Field[] => frame.fields.filter((field) => field.type === FieldType.number);

/** Every node id some nodes frame already declares, and which therefore needs nothing. */
function declaredNodeIds(nodesFrames: DataFrame[]): Set<string> {
  const declared = new Set<string>();
  for (const frame of nodesFrames) {
    for (const field of numericFields(frame)) {
      declared.add(field.name);
    }
  }
  return declared;
}

/**
 * One numeric field per inferred node, carrying **no stat**.
 *
 * `null` rather than the node's degree, which is what the reader's fallback used to put in
 * the value slot. A degree is not a measurement: it was drawn under the node by "Show node
 * values" and read as the node's `Value` in the tooltip, in both cases indistinguishable
 * from a real stat the query never asked for — and, before `formatDerivedMarkValue`, even
 * borrowed another mark's unit. A node the response only implies has nothing to report, and
 * saying so costs nothing: `readNodes` reduces `[null]` to `null`, `toNodeItems` then omits
 * `value` entirely, so the label stays one line and the tooltip omits the row.
 *
 * `config` is empty on purpose. Every default a node needs already comes from
 * `fieldConfig.defaults` — colour included, since the family defaults to the classic palette
 * (`STANDARD_COLOR_OPTION`) — and anything set here would be a default the user cannot see
 * in the editor and cannot clear.
 */
function derivedNodeFields(ids: readonly string[], rows: number): RelationsFamilyField[] {
  return ids.map((id) => ({
    name: id,
    type: FieldType.number,
    config: {},
    values: Array.from({ length: rows }, () => null),
  }));
}

/**
 * Add the missing nodes to the frame that already holds the declared ones.
 *
 * Appending beats emitting a second nodes frame whenever there is a frame to append to,
 * and the reason is role resolution rather than tidiness: `findNodesFrames` treats a
 * declared frame as a **filter**, so introducing one `graph-nodes-wide` frame beside a
 * merely shape-matched one would make the reader collect the new frame and drop the real
 * one — every declared node's config lost, to a pass whose entire job is to add config.
 * Appending changes no frame's role, so it cannot change which frames are read.
 *
 * The new fields are padded to the frame's own row count. A nodes frame from
 * `legacyToWide` is one row and a natively-wide one may be many; either way a ragged frame
 * would read fine here (every mark reduces over its own values) and display wrong
 * everywhere else, the panel inspector included.
 */
function withDerivedNodes(frame: DataFrame, missing: readonly string[]): DataFrame {
  const rows = Math.max(frame.length, 1);
  return { ...frame, fields: [...frame.fields, ...derivedNodeFields(missing, rows)], length: rows };
}

/**
 * Declare every endpoint the response left implicit.
 *
 * Frames this does not own are returned **by reference**, and when nothing is missing the
 * input array itself is — the same contract as both siblings, for the same reason: a
 * custom transform operator bypasses `config.filter`, so it sees the whole response and
 * must leave it identity-intact, which is what lets the host skip re-running field
 * overrides. That is what makes this safe to register on the already-wide branch, where a
 * response that declares all its nodes must come out untouched.
 *
 * A new frame goes **first**. Grafana assigns `seriesIndex` — and therefore each classic
 * palette colour — in field order across the response, so leading with the nodes gives
 * them indices `0..n-1`: the colours `deriveNodesFromLinks` and `fillPaletteColors` already
 * produce on a host that never runs this. Trailing it would recolour every node of every
 * existing dashboard by the number of edges in front of it.
 */
export function deriveNodes(frames: DataFrame[]): DataFrame[] {
  const roles = resolveGraphWideRoles(frames);
  if (!roles) {
    return frames;
  }

  const declared = declaredNodeIds(roles.nodesFrames);
  const missing = [...endpointNames(roles.edgesFrames)].filter((id) => !declared.has(id));
  if (missing.length === 0) {
    return frames;
  }

  debug(`Creating ${missing.length} derived node(s)`, LOG_LEVELS.info, {
    derived: missing,
    declared: [...declared],
    appended: roles.nodesFrames.length > 0,
  });

  const [target] = roles.nodesFrames;
  if (target == null) {
    const { refId } = roles.edgesFrames[0];
    return [nodesWideFrame(refId != null ? { refId } : {}, derivedNodeFields(missing, 1)), ...frames];
  }
  return frames.map((frame) => (frame === target ? withDerivedNodes(frame, missing) : frame));
}

/**
 * `deriveNodes` as a transformation the host can run above the panel.
 *
 * A `CustomTransformOperator` for the same reasons as its two siblings: no JSON-configured
 * transformation can express this (nothing in core reads endpoint labels, and nothing in
 * core writes `meta.type`), and a function cannot round-trip dashboard JSON, so the entry
 * is structurally non-persistable rather than only by convention.
 */
export const deriveNodesOperator: CustomTransformOperator = () => (source) => source.pipe(map(deriveNodes));
