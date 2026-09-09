# Would ad-hoc panel transformations solve the graph-wide migration?

> **Status: six PRs, all still open drafts, unmerged — re-checked 2026-08-07 (originally
> 2026-08-01).** [grafana/grafana#129542](https://github.com/grafana/grafana/pull/129542)
> (backend schema, "PoC / UNVERIFIED") →
> [#129544](https://github.com/grafana/grafana/pull/129544) (frontend plumbing) →
> [#129545](https://github.com/grafana/grafana/pull/129545) (`@grafana/ui` hooks) →
> [#129546](https://github.com/grafana/grafana/pull/129546) (table adoption) and
> [#129563](https://github.com/grafana/grafana/pull/129563) (logs-table adoption), plus
> the upstream dependency [grafana/scenes#1589](https://github.com/grafana/scenes/pull/1589).
> All authored by `gtk-grafana`, none reviewed, all still draft/open as of the re-check.
> Nothing here is landed; re-verify status immediately before public release regardless —
> this file will drift out from under any restated PR content, which is why the analysis
> below stays at the conclusion level rather than walking the diffs.

This doc answers one question: **could the core Node graph panel, or this plugin's
relations panel, declare a legacy-long → wide conversion that runs early enough for
per-node and per-edge field overrides to work?** That's the central asymmetry
[graph-wide-migration.md](./graph-wide-migration.md) rests on — an adapter _inside_ a
panel runs after `applyFieldOverrides`, so legacy input can never gain per-mark overrides
however the panel reshapes it; only something running earlier in the pipeline can fix
that.

## Verdict

**Partially.** The stack does make the override _apply_ — `context.applyFieldConfig`
runs `applyFieldOverrides` over the post-transformation frames, so a `byName` override on
a node id or an `a-->b` edge would match. But it gets there by having the panel **opt out
of and reimplement** the standard pipeline (query → transform → override → panel),
not by declaring a conversion, and three things follow from that:

- **Nothing is declared.** There's no `PanelPlugin` API for this; the panel would have
  to write the conversion into the dashboard's persisted transformation array at
  runtime, which is a much larger commitment than registering a prefix.
- **The override picker still lists the wrong names.** The picker reads the
  transformer's pre-bypass output, so under this stack it would offer `id`/`source`/
  `target`/`mainstat` — the legacy columns — never `eu-west` or `a-->b`. A `byName`
  override would work if hand-typed and be unpickable in the UI.
- **It's experimental and off by default**, and adopting it would mean _every_ family in
  this plugin — not just relations — opts out of the standard pipeline, for every
  dashboard, since a plugin has one id and the flag is per-plugin.

## What this would mean for this plugin

**Recommendation: do not block, do not adopt.** Ship the migration as planned
(hand-rolled `legacyToWide` at the frame boundary, registered as a transformation
prefix, plus a `ChartNotices` corner notice) and treat this stack as evidence for what a
_narrower_ core change should look like, not as something to build against.

- The original "adapter decision" — a hand-rolled `legacyToWide` over delegating to
  `transformDataFrame` — stands. This stack fixes one of its three objections
  (invisibility: the ad-hoc entry is in the Transform tab) but makes host-dependence
  worse, not better: four unmerged host contracts instead of one.
- The capability matrix's "wide only for legacy input" line doesn't collapse. A legacy
  dashboard could reach the wide column under this stack, but only after the panel
  writes a transformation into it at runtime — the same user-visible act as the notice's
  own recommendation ("add a **Rows to fields** transformation"), just automated instead
  of asked for.
- Adopting `adHocTransforms: true` would cost every family in the plugin — not just
  relations — the standard pipeline, for every dashboard, for a benefit that only helps
  legacy input.

For the **core** Node graph panel specifically, the stack buys little: that panel
addresses marks by row, not by field, so it has no code to read the per-node overrides
the mechanism would newly let through. Teaching it to read `graph-*-wide` is the whole of
this plugin's migration, and none of that work gets cheaper.

## Where the conversion should live instead

The smallest change that actually closes the gap is a **declarative, non-persisted
pipeline prefix on the plugin** — `PanelPlugin` gains a hook that, given the source
frames, returns the transformations to prepend (empty for already-wide input); the
scene's own transformer runs it before anything in the Transform tab, so the override
picker sees the converted frames for free, nothing is persisted, and no dashboard is
marked dirty on open. That design has since been worked up properly, with the return
type, the exact insertion point and the implementation hazards, in
[adhoc-transformations-split.md](./adhoc-transformations-split.md) — this doc is the
"why a narrower change is needed" argument; that one is the design.

Two cheaper options need no core change at all and remain on the table regardless: the
notice + documented `Rows to fields` recipe already shipped, and datasources emitting
`graph-*-wide` natively so no conversion exists to order.

## References

**PRs tracked above**

- [grafana/grafana#129542](https://github.com/grafana/grafana/pull/129542),
  [#129544](https://github.com/grafana/grafana/pull/129544),
  [#129545](https://github.com/grafana/grafana/pull/129545),
  [#129546](https://github.com/grafana/grafana/pull/129546),
  [#129563](https://github.com/grafana/grafana/pull/129563)
- [grafana/scenes#1589](https://github.com/grafana/scenes/pull/1589)
- [grafana/grafana#129905](https://github.com/grafana/grafana/pull/129905) — the
  item-override proposal this question is adjacent to, reframed in
  [graph-wide-migration.md](./graph-wide-migration.md)
- Superseded earlier spike, both closed:
  [#124605](https://github.com/grafana/grafana/pull/124605),
  [#124607](https://github.com/grafana/grafana/pull/124607)

**This repo**

- The contract: [../data-plane/graph-wide.md](../data-plane/graph-wide.md)
- The row form: [../data-plane/graph-long.md](../data-plane/graph-long.md)
- The rewrite plan and the asymmetry this doc tested:
  [graph-wide-migration.md](./graph-wide-migration.md)
- The design this doc's recommendation points to:
  [adhoc-transformations-split.md](./adhoc-transformations-split.md)
- The per-item-override question this doc is adjacent to, now resolved:
  [../src/modules/relations/parity.md](../src/modules/relations/parity.md), "Notes / gaps"
