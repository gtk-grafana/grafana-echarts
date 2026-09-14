import { registerUpdateLifecycle } from 'echarts/core';
import {
  hideLabel,
  isLabelHost,
  labelBox,
  type LabelBox,
  type LabelHost,
  overlaps,
  readGraph,
} from 'lib/echarts/relations/edgeLabels/geometry';
import { markKey, type RevealIndex, setRevealIndex } from 'lib/echarts/relations/edgeLabels/reveal';

/**
 * Everything ECharts' shared label-layout stage gets wrong for a **graph edge's label**,
 * which is the one label in the family that its *host* positions.
 *
 * A zrender label is drawn through its host's `textConfig`, and every label ECharts'
 * `LabelManager` manages is rewritten into canvas coordinates with `local: false` on the
 * host to match (`updateLayoutConfig`, commented `// Force to set local false`). That is
 * right for the labels it positions from an anchor keyword, and wrong here:
 * `Line.prototype.beforeUpdate` places an edge's label along the line, in the line's own
 * coordinates, on every redraw — `Line` asks for `local: true` explicitly. The two halves
 * then disagree, and the first two problems below follow from that.
 *
 * ## Keeping them attached
 *
 * With `local: false` the label's coordinates are read as canvas coordinates
 * (`innerTransformable.parent = isLocal ? this : null`), so the host's transform stops
 * carrying it. Invisible while the series group's transform is identity; the moment a
 * graph is panned or zoomed, the edge values stay behind while the links slide out from
 * under them. Measured on a three-node ring panned by (40, 25): every node label moved by
 * exactly that, and both edge values by (0, 0).
 *
 * ## Hiding the ones that overlap
 *
 * "Hide overlapping labels" reached node labels and not edge values, because `hideOverlap`
 * measures each label from the rect `_addLabel` captured — and for an edge label that rect
 * is a frame stale, since `beforeUpdate` has not run for this pass yet. On a first render
 * it is the rect the label had before it was ever positioned, so *every* edge value looks
 * stacked at the same spot and all but one is dropped, then one more survives each
 * subsequent pass: 1, 2, 3, then all 4 over four renders of an unchanged fixture. That is
 * why `getRelationsLabelLayout` holds them back from the stage, and this is the other half
 * of that: the geometry is settled here first, so the decision is made on where each label
 * will actually be drawn and comes out the same on every pass.
 *
 * **Node labels win.** ECharts orders `hideOverlap` by `priority`, which defaults to the
 * area of the label's host, and a link's host spans the whole link — so letting the stage
 * arbitrate both kinds would let a long edge's value erase a node's name. It is the wrong
 * way round: a name identifies the mark, a value is also in its tooltip. So the stage keeps
 * the node labels it already arbitrated and this yields to them, then to earlier edges in
 * data order.
 *
 * ## Giving a hidden one back on hover
 *
 * A value that was dropped should come back when the reader asks for that edge — by hovering
 * or pinning the edge itself, **or either of the nodes it joins**, whose edge values are
 * exactly what hovering a node is asking about.
 *
 * `hideOverlap` gets the first of those for free by hiding a label in the *normal* state and
 * un-hiding it in the *emphasis* one, and it cannot get the second at all: the adjacency
 * ECharts computes for the fade only *un-blurs* the focus set (`blurSeries` →
 * `leaveBlurOfIndices`), which is the same normal state the edge was already in.
 *
 * So both are done here, and the emphasis-state trick is deliberately **not** used for the
 * first — the two do not compose. zrender's state machine copies `ignore` into `_normalState`
 * as soon as a state mentioning it is applied (`_savePrimaryToNormal`; `PRIMARY_STATES_KEYS`
 * includes `ignore`), and from then on every return to normal re-hides the label, undoing a
 * reveal that came from anywhere else. Measured: with the trick in place, a label revealed by
 * hovering its node was put back by the next state change, so pinning the node lost it. With
 * `ignore` written from one place only, nothing else touches it. See
 * {@link revealEdgeLabelsFor}.
 *
 * ## Why this hook
 *
 * Registered on the same lifecycle hook the label-layout feature uses, and after it, so the
 * repairs land inside the update that needs them rather than a frame later. It has to be
 * this hook and not `series:afterupdate`: `updateLabelLayout()`, which a graph zoom calls
 * directly, re-runs `updateLayoutConfig` (and so re-forces `local: false`) without running
 * an update at all. That is also why every series is walked rather than
 * `params.updatedSeries`, which that caller passes empty.
 *
 * Reaching an edge label at all means its series asked for a `labelLayout`, since that is
 * the only thing that sets `local: false`; within this plugin that option is emitted for
 * exactly one reason, so it also means the reader asked for overlapping labels to be
 * hidden. See `getRelationsLabelLayout`.
 *
 * https://echarts.apache.org/en/option.html#series-graph.labelLayout
 */
/**
 * Stop an edge's value **fading in** every time the chart is rebuilt.
 *
 * `LabelManager._animateLabels` fades a label it has no remembered layout for
 * (`if (!oldLayout)`), which is right on a first render and wrong on every one after it.
 * Whether a rebuild hits that branch turns on whether the series kept its label elements: a
 * `graph` updates them in place and never fades, while `SankeyView.render` builds every
 * shape from scratch, so its edge values ramp `0.001 → 1` over ~120 frames on each pass. The
 * fade goes through `initProps`, so it is timed by `animationDuration` — the *initial*-render
 * duration — and a step that redraws instantly is followed by a second of labels dissolving.
 *
 * Edge labels only. Node names keep theirs, since a first render is the case it is for.
 *
 * `disableLabelAnimation` is zrender's own opt-out, read off the label's **host**, and covers
 * the position tween as well as the fade. No loss either way: a sankey has no tween to keep
 * (see `todo/relations-scrub-animation.md`), and a graph's edge label is positioned by its
 * host on every redraw, which is the premise the rest of this module rests on.
 *
 * **Registered before the label-layout feature**, unlike {@link registerEdgeLabelLayout}:
 * hooks run in registration order, and the flag has to be set before `processLabelsOverall`
 * reads it — on a sankey there is no later pass, since the host is thrown away with the rest.
 */
export function registerEdgeLabelFadeIn(): void {
  registerUpdateLifecycle('series:layoutlabels', (ecModel) => {
    ecModel.eachSeries((seriesModel) => {
      // Both graph and sankey answer `getGraph()` — sankey is built on the same node/edge
      // model — so one walk covers every series in the family that draws edge values.
      const graph = readGraph(seriesModel);
      if (graph == null) {
        return;
      }
      for (let dataIndex = 0; dataIndex < graph.edgeData.count(); dataIndex++) {
        const host = graph.edgeData.getItemGraphicEl(dataIndex);
        if (isLabelHost(host)) {
          host.disableLabelAnimation = true;
        }
      }
    });
  });
}

export function registerEdgeLabelLayout(): void {
  registerUpdateLifecycle('series:layoutlabels', (ecModel, api) => {
    const revealed: RevealIndex = new Map();
    ecModel.eachSeries((seriesModel) => {
      // Only a graph has links whose labels their host positions — and asking the series
      // for its graph is also how each edge is matched to the two nodes it joins, which the
      // reveal needs and no element carries.
      const graph = readGraph(seriesModel);
      const group = api.getViewOfSeriesModel(seriesModel)?.group;
      if (graph == null || group == null) {
        return;
      }

      // Walked by index rather than by traversal, so every edge arrives with its endpoints.
      // A host the stage did not rewrite is one the reader did not ask to arbitrate.
      const edges: Array<{ host: LabelHost; nodes: number[]; dataIndex: number }> = [];
      for (let dataIndex = 0; dataIndex < graph.edgeData.count(); dataIndex++) {
        const host = graph.edgeData.getItemGraphicEl(dataIndex);
        const edge = graph.getEdgeByIndex(dataIndex);
        if (!isLabelHost(host) || host.textConfig?.local !== false || edge == null) {
          continue;
        }
        edges.push({ host, nodes: [edge.node1.dataIndex, edge.node2.dataIndex], dataIndex });
      }
      if (edges.length === 0) {
        return;
      }

      // Give each host its anchoring back before anything is measured: the box below is the
      // transform this decides.
      for (const { host } of edges) {
        host.setTextConfig({ local: true });
        // The host is already dirty from the rewrite, but saying so is what makes the repair
        // independent of that: only a dirty host re-runs `updateInnerText`, which reads
        // `local`.
        host.markRedraw();
      }

      // Every other label the stage manages — the node names it has already arbitrated,
      // which these yield to.
      const edgeHosts = new Set(edges.map(({ host }) => host));
      const taken: LabelBox[] = [];
      group.traverse((element) => {
        if (isLabelHost(element) && element.textConfig?.local === false && !edgeHosts.has(element)) {
          const box = labelBox(element);
          if (box != null) {
            taken.push(box);
          }
        }
      });

      for (const { host, nodes, dataIndex } of edges) {
        const box = labelBox(host);
        if (box == null) {
          continue;
        }
        if (!taken.some((other) => overlaps(box, other))) {
          taken.push(box);
          continue;
        }
        const label = hideLabel(host);
        if (label == null) {
          continue;
        }
        // Under the edge itself and under both of its nodes: hovering any of the three is
        // asking about this value.
        const keys = [
          markKey(seriesModel.seriesIndex, 'edge', dataIndex),
          ...nodes.map((node) => markKey(seriesModel.seriesIndex, 'node', node)),
        ];
        for (const key of keys) {
          revealed.set(key, [...(revealed.get(key) ?? []), label]);
        }
      }
    });

    // Replaced wholesale: this render re-decided every label, so whatever was on screen for
    // the last one is gone with it (a render resets `ignore` through `setLabelStyle`).
    setRevealIndex(api.getZr(), revealed);
  });
}
