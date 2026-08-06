# Graph, adjacency matrix — `graph-edges-matrix`

A **cell-based** contract for graph data: **one field is one node, one cell is one
edge.** A leading `string` field of source-node ids keys the rows; every numeric field
is a target node; the cell at (row, column) is the edge from that row's node to that
column's node, and its value is the edge weight. Absent cell means no edge.

> **This is a comparison, not a replacement proposal.** The headline wide contract is
> [graph-wide.md](./graph-wide.md) — `graph-nodes-wide` / `graph-edges-wide`, one edge
> per **field**. That doc already carries the matrix as a documented variant
> ([Dense graphs](./graph-wide.md#dense-graphs-the-adjacency-matrix-variant)) and
> already wins the performance argument for it outright. This doc asks the question the
> performance table cannot answer: **what does a matrix let a user express, what does it
> take away, and what does the panel's configuration surface look like either way.**
> Performance appears once, near the end, by reference.
>
> **Nothing reads this contract either.** Feeding a matrix frame to the relations panel
> today throws exactly as a wide frame does — measured: `csv_content` of
> `source,a,b,c / a,,10,20 / …` renders _"An unexpected error happened"_, because
> `isEdgesFrame` needs fields literally named `source` **and** `target`
> (`src/lib/echarts/converters/nodeGraph.ts`), finds only `source`, and `buildOption`
> raises on the `null`.
>
> **But something already reads the frame.** This plugin's
> [matrix heatmap](./heatmap-matrix.md) consumes precisely this layout — first string
> field as row categories, every numeric field as a column, `null` cells drawn empty —
> and the same CSV renders as a heatmap in the ECharts Heatmap panel today (measured:
> canvas ink present, both at N=3 and N=30). So the shape is not hypothetical in this
> repo. Only the **graph** interpretation of it is.

## Naming

`DataFrameType` in `@grafana/data` 13.1.1 still has exactly twelve members
(`timeseries-wide|long|many|multi`, `numeric-wide|multi|long`, `log-lines`,
`directory-listing`, `heatmap-rows`, `heatmap-cells`, `histogram`) and none is
graph-related — re-measured against the running instance, so nothing here redefines an
existing kind, and the same `[0, 1]` `typeVersion` rule applies as in
[graph-wide.md](./graph-wide.md).

The convention is `<kind>-<shape>`, with the graph kinds adding a **role** infix
(`graph-`**`nodes`**`-wide`, `graph-`**`edges`**`-wide`). Candidates, and why one wins:

| Name                    | Verdict      | Reason                                                                                                                                                                                         |
| ----------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graph-edges-matrix`    | **Chosen**   | Keeps the role infix, so it pairs with `graph-nodes-wide` unchanged and role resolution reads the same. `matrix` is a shape word in the same register as `rows` / `cells` / `wide`             |
| `graph-adjacency-wide`  | Rejected     | `adjacency` is a _representation_, not a shape, so it does not slot where `wide`/`long`/`cells` slot; and the trailing `wide` is redundant — a matrix is wide by construction                  |
| `graph-adjacency`       | Rejected     | Drops the role, so `graph-nodes-wide` no longer visibly pairs with it, and a future node × attribute matrix becomes unnameable                                                                 |
| `graph-matrix`          | Rejected     | Same role problem, and it reads as "the graph kind, matrix shape" when the frame is specifically an **edges** frame                                                                            |
| `graph-edges-wide` only | **Rejected** | This is what [graph-wide.md](./graph-wide.md) does today, and it is the one thing this doc argues against: the two shapes are not shape-detectable from each other, so a reader must be _told_ |

It really is an edges frame. A `graph-edges-wide` frame also implies a node set (from
labels or the name split) — the matrix differs only in that the implied target nodes
_coincide with fields_, which is what makes them addressable. The payload is still edges.

**File name follows the kind:** this doc is `data-plane/graph-edges-matrix.md`.

## The shape, against the other two

Six edges over three nodes (`a`, `b`, `c` fully connected). Full side-by-side with
field counts is in
[graph-wide.md](./graph-wide.md#the-three-shapes-side-by-side); the short version:

| Shape                       | A mark is | Fields | Rows | Configurable per mark          |
| --------------------------- | --------- | -----: | ---: | ------------------------------ |
| `graph-edges-long` (legacy) | a row     |      4 |    6 | nothing                        |
| `graph-edges-wide`          | a field   |      6 |    1 | every edge, independently      |
| **`graph-edges-matrix`**    | a cell    |      4 |    3 | every **node**; edges by value |

```csv
source,a,b,c
a,,10,20
b,30,,40
c,50,60,
```

| source | `a` | `b` | `c` |
| ------ | --- | --- | --- |
| a      |     | 10  | 20  |
| b      | 30  |     | 40  |
| c      | 50  | 60  |     |

Confirmed to render from `csv_content` with **no transformations at all** — and, unlike
the wide fixtures, with no `convertFieldType` either. Measured through
`/api/ds/query`: the key column arrives `type: string`, every target column arrives
`type: number` with `null` where the cell is blank. That is the matrix's first and most
underrated property: **it is the only graph shape that is a single pasteable CSV with
zero pipeline.**

## Terms, in addition to graph-wide.md's

| Term                  | Meaning here                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Row key**           | The leading `string` field. Its values are source-node ids and they are the row dimension. Named `source\target` when `groupingToMatrix` produced it; free-form otherwise   |
| **Cell**              | One (row key, column) pair. The edge. Not a field, not a row — the intersection                                                                                             |
| **Bundle**            | All the cells of one column: every edge **inbound** to that column's node. The finest granularity a Grafana matcher can name in this shape                                  |
| **Semantic diagonal** | The cells where the row key equals the column name, i.e. self-loops. **Not** the positional diagonal — see [Non-square and permuted](#non-square-permuted-and-the-diagonal) |

## What a cell can carry — the whole argument in one section

[graph-wide.md](./graph-wide.md#dense-graphs-the-adjacency-matrix-variant) states that
in this variant _"per-edge colour, links, hiding and curveness are **not available**"_.
Measured, that is **too strong for colour and links, and exactly right for the rest**,
and the line the measurements draw is the single most useful fact about the shape:

> **Anything that resolves from a cell's _value_ reaches the edge. Anything that
> requires the edge's _identity_ reaches only its bundle.**

Because a column is a `Field`, `applyFieldOverrides` builds it a display processor, and
that processor is called **per cell**. So the column's colour scheme, thresholds, value
mappings, unit, decimals and `min`/`max` all resolve against one cell's own number.
Measured on the matrix above, with three overrides:

| Override on column  | Cell        | Resolved                         |
| ------------------- | ----------- | -------------------------------- |
| `continuous-GrYlRd` | (b, a) = 30 | `#d3c840`                        |
| `continuous-GrYlRd` | (c, a) = 50 | `#f48349`                        |
| `thresholds` at 50  | (a, b) = 10 | `#73BF69` green                  |
| `thresholds` at 50  | (c, b) = 60 | `#F2495C` red                    |
| `mappings` on `40`  | (b, c) = 40 | text `THE b-->c EDGE`, `#B877D9` |

That last row is worth staring at: **a single cell _can_ be styled individually** — by
matching its value rather than its identity. Confirmed in a live Table panel, where the
one cell reads `the b-->c edge` and its two neighbours do not. It is fragile (it
retargets the moment the weight changes, and it hits every cell in the column sharing
that value), so it is a curiosity rather than a mechanism. But it means the honest claim
is "cells are not addressable **by identity**", not "cells are not configurable".

Data links go further, and here the matrix is genuinely good. One `links` override on a
column yields **one resolved href per cell**, and both endpoints plus the weight are
interpolable. Measured live on a Table panel from the URL
`http://h/${__data.fields[0]}/to/a?w=${__value.raw}` set on column `a`:

| Cell        | href                   |
| ----------- | ---------------------- |
| (b, a) = 30 | `http://h/b/to/a?w=30` |
| (c, a) = 50 | `http://h/c/to/a?w=50` |
| (a, a) = ∅  | `http://h/a/to/a?w=`   |

So **per-edge data links are available in this shape**, as one template per bundle
rather than one config per edge — which at N=30 is 30 overrides instead of 870. Two
measured caveats:

- **`${__data.fields[0]}` works; `${__data.fields["source\target"]}` does not.** The
  backslash in `groupingToMatrix`'s generated key name defeats both the bracket and the
  dot accessor (measured: both resolve empty; the positional form resolves correctly
  regardless of the key field's name). Either use the positional form or rename the key
  column.
- **Absent cells still get a link, and still get a colour.** `field.display(null)`
  returns `text: ''` with a real colour, and `getLinks` happily builds an href for the
  empty diagonal. A reader must skip absent cells explicitly; nothing upstream will.

What genuinely cannot be expressed per edge, because each is one scalar on the field:

| Property                                                              | Granularity in a matrix                    |
| --------------------------------------------------------------------- | ------------------------------------------ |
| `config.custom.lineWidth` / `.lineType` / `.curveness`                | per **bundle** (all inbound edges)         |
| `config.custom.hideFrom`                                              | per **bundle**, and it also hides the node |
| `config.displayName`                                                  | the **node** — an edge has no label        |
| A fixed colour for one named edge                                     | **not expressible**                        |
| Two edges in the same column with the same weight, styled differently | **not expressible**                        |

Per-bundle is not a consolation prize. "Every call into the database is dashed",
"normalise inbound latency per service", "link every inbound edge of `api` to its
trace" are all one override each, and all three are N overrides in the edge-per-field
form. The matrix does not remove per-edge configuration so much as **change its unit
from the edge to the inbound star**.

## Capability matrix

Against both other shapes. **Wide** is `graph-edges-wide` (+ `graph-nodes-wide`);
**long** is [node-graph.md](./node-graph.md).

| Capability                                            | Long                        | Wide (edge-per-field)              | **Matrix**                                                                        |
| ----------------------------------------------------- | --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| Per-**node** config, by name                          | No                          | Yes, via a nodes frame             | **Partly — column nodes only**, no nodes frame needed. Row-only nodes: no         |
| Per-**edge** config by identity                       | No                          | **Yes**                            | **No** — a cell has no matcher                                                    |
| Per-edge config by **value** (colour, mappings, unit) | No                          | Yes                                | **Yes** — the column's processor runs per cell                                    |
| Per-edge **data links**                               | Row links only, all-or-none | **Yes**, one per edge              | **Yes**, one template per bundle resolving per cell (measured hrefs above)        |
| Per-edge visibility                                   | No                          | **Yes** (`custom.hideFrom`)        | Bundle only, and it takes the node with it                                        |
| Edge **identity**                                     | `id` column                 | `field.name` — stable, overridable | Implicit `(row key, column)`. Derivable as `<row>-->` + `<column>` but not stored |
| Edge **labels / metadata**                            | `detail__*` columns         | `field.labels`                     | **None** — no per-cell carrier exists                                             |
| **Parallel edges**                                    | **Yes** (two rows)          | Yes, with distinct ids + labels    | **Structurally impossible** — one cell per ordered pair                           |
| **Self-loops**                                        | Yes                         | Yes (`a-->a`)                      | **Yes** — the semantic diagonal                                                   |
| **Directedness**                                      | Implicit, row → column      | Implicit, source → target          | Implicit, row → column. **Undirected is not declarable** in any of the three      |
| **Weighted**                                          | `mainstat`, may be a string | The field's values                 | The cell. **Numeric only** — a string value field pivots to string columns        |
| **Unweighted**                                        | Omit `mainstat`             | Value `1`                          | `1` = present, blank = absent. The classic form; cleanest of the three            |
| **Sparse**                                            | Natural — one row per edge  | Natural                            | Wasteful but harmless: N² cells, mostly `null`                                    |
| **Dense**                                             | Natural                     | Pathological (N² fields)           | **Natural — N+1 fields at any density**                                           |
| Row and column node sets **differ**                   | N/A                         | N/A                                | **Yes, and it happens by default** — see below                                    |
| **Isolated nodes**                                    | Needs a nodes frame         | Needs a nodes frame                | **As a row key, yes**; as a column, no (an all-blank CSV column types `string`)   |
| A **nodes frame** still needed?                       | For metadata                | For every per-node property        | For node **stats**, and for row-only nodes. **And it blocks the pivot** — below   |
| **Time / range** row dimension                        | No (needs aggregation)      | **Yes** — three variants           | **No** — the rows are spent on the source node                                    |
| `reduceOptions` (`calcs[0]` / `[1]`)                  | N/A                         | The stat contract                  | **Inapplicable** — reducing a column collapses its whole bundle                   |
| Authorable as raw `csv_content`                       | Yes                         | Yes, but no labels and no config   | **Yes, with zero transformations** (measured)                                     |
| Survives `meta.type`                                  | N/A                         | Only from a native datasource      | Same — and `groupingToMatrix` emits no `meta` at all (measured)                   |
| Shape-detectable                                      | Yes (`source` + `target`)   | Yes (labels, or `-->` in names)    | **No** — collides with `heatmap` matrix and `numeric-wide`                        |

Three rows deserve emphasis because they are the ones nobody predicts.

**No time dimension, at all.** The wide form's whole
[row-dimension story](./graph-wide.md#row-dimension-variants) — instant, ranged, multi —
exists because a field's values are indexed by something. In a matrix that something is
already the **source node**. There is no second axis, so a matrix is inherently a single
instant, and a "matrix over time" would need one frame per timestamp, a convention
Grafana does not have and which `groupingToMatrix` cannot produce (it no-ops on
multi-frame input — measured).

**`reduceOptions` is not merely unused, it is wrong.** The wide contract registers
`addStandardDataReduceOptions` and truncates `calcs` to two
([the reduce contract](./graph-wide.md#the-reduceoptions-contract)). Applied to a
matrix, `calcs[0]` over column `a` returns one number for _all_ of `a`'s inbound edges.
A panel that reads both shapes must therefore **hide or ignore the Value options** when
the matrix reader is active, which is a visible editor difference, not an internal one.

**Isolated nodes are half-expressible, and the half that works is the CSV half.** An
all-blank column degrades to `type: string` under `csv_content` (measured: `source,a,b,z
/ a,,10, / b,30,, / z,,,` gives column `z` as `string`), so a "every numeric field is a
node" reader drops it. The same node as an all-blank **row** works, because the row key
is a string field by construction: `z` lands in the node set with no outbound edges and
no column. So the matrix _can_ carry an isolated node with no nodes frame — as a row —
which neither other shape can. It just cannot make that node configurable.

## The addressability asymmetry, honestly

A column is a field, so `byName` targets it. A cell is not a field, and **no Grafana
matcher addresses one.** Re-measured against the live registry: `fieldMatchers.list()`
has twelve entries (`byType`, `byTypes`, `numeric`, `time`, `byName`, `byRegexp`,
`byNames`, `byRegexpOrNames`, `byFrameRefID`, `first`, `firstTimeField`, `byValue`) and
the override picker offers five of them — _Fields with name_, _Fields with name matching
regex_, _Fields with type_, _Fields returned by query_, _Fields with values_. Every one
of the twelve has the signature `(field, frame, allFrames) => boolean`. **There is no
row concept and no cell concept anywhere in the registry.**

Does `byValue` buy anything? Yes, but not what you would hope. It reduces a field to one
number and tests it, so on a matrix it selects **nodes by an aggregate of their inbound
edges** — measured, `{reducer: max, op: gte, value: 60}` over the matrix above matches
column `b` and nothing else. That is a genuinely new selector: _"every service whose
worst inbound edge exceeds 60"_, expressible in one override, with no equivalent in the
long form. It is still column granularity. (The mirror is neat: on a single-row
`graph-edges-wide` frame the same matcher selects **edges** by weight, so `byValue`
changes what it means with the shape.)

Does a row-key override buy anything? No. `byName: 'source\target'` matches the key
field exactly (measured) and the key field is neither a node nor an edge — overriding it
changes nothing about the graph. It does, however, **appear in the picker as the first
entry**, which is a small discoverability wart: the one field a user must not configure
is the one at the top of the list.

**Verdict on the asymmetry: tolerable, and for the case the shape exists for, desirable.**
The reasoning is the framing constraint. A graph stops being readable somewhere around
a hundred nodes, so the interesting question is never "can I style edge 4 812 of 9 900"
— it is "can I say something about this node and everything that flows into it". The
matrix answers exactly that, in one override, and it answers "colour every edge by
latency" too because colour is value-driven. What it cannot do is single out one edge
among the many between the same pair of neighbourhoods — and at the densities where
anyone reaches for a matrix, singling out one edge is not a thing a user can even see.

It is **not** desirable at low density. At N=5 with 8 edges, per-edge identity is exactly
what a user wants, and the edge-per-field form gives it for 8 fields.

## The ambiguity a matrix introduces

[graph-wide.md](./graph-wide.md#three-normative-rules) rule 3 says a `byName` override
on a matrix column **targets the node**, not the column's inbound edges. Tested, that
rule is **directionally right but incomplete**, and the gap matters.

The measured behaviour splits by _property_, not by intent:

| Property class                                                                     | What it actually configures                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `displayName`, `custom.nodeRadius` / `.subtitle` / `.icon` / `.fixedX` / `.fixedY` | The **node**. Unambiguous                                         |
| `color` mode, `thresholds`, `mappings`, `unit`, `decimals`, `min`, `max`           | The **edges**, resolved per cell. Unambiguous, and _not_ the node |
| `links`                                                                            | The **edges** (one href per cell, measured)                       |
| `custom.hideFrom`                                                                  | **Both** — the column vanishes, taking node and bundle            |

So "a column override targets the node" is true of the properties that name a thing and
false of every property that reads a number. A matrix column is a node **by identity**
and an edge bundle **by value**, simultaneously, and no rule can collapse that because
it follows from `Field` having both a name and values.

It gets sharper with a nodes frame present. Measured: with a matrix frame (refId `A`) and
a `graph-nodes-wide` frame (refId `B`) that share node ids, a single
`byName: 'a'` override lands on **both** — the nodes-frame field `a` _and_ the matrix
column `a` — so one override sets the node's colour and unit and every inbound edge's
colour and unit at once:

| Frame     | Field | After `byName: 'a'` → `color: dark-red`, `unit: ms` |
| --------- | ----- | --------------------------------------------------- |
| A, matrix | `a`   | `dark-red`, `ms`                                    |
| B, nodes  | `a`   | `dark-red`, `ms`                                    |

Whether that is a bug or a feature depends entirely on the property, in exactly the split
above. "Highlight `a` red" wanting the node **and** its inbound edges red is arguably
what a user means. "The node's stat is milliseconds" leaking onto edges measured in
requests per second is plainly wrong.

There is one escape hatch and it is blunt: **`byFrameRefID` separates the roles.**
Measured, a `byFrameRefID: 'B'` override applied `decimals: 3` to the nodes frame and
left the matrix frame untouched. But Grafana overrides carry exactly one matcher, with no
conjunction, so you can say "everything named `a`" or "everything in frame B" and never
"the field named `a` in frame B". **The node/edge role of a matrix column is not
separable per node by any single matcher.**

So the normative rule should be restated rather than kept:

> **A `byName` override on a matrix column applies to the node's identity and to its
> inbound edge bundle's values, jointly and inseparably.** Where the two roles need
> different configuration, put the node's configuration in a `graph-nodes-wide` frame
> and select it with `byFrameRefID`, accepting that this is all-nodes granularity.

## Non-square, permuted, and the diagonal

`groupingToMatrix` (Column = `target`, Row = `source`, Cell = `mainstat`) is the
transformation that produces this shape from a legacy edges frame. What it emits,
re-measured against 13.1.0 and read off its implementation in
`@grafana/data/dist/esm/transformations/transformers/groupingToMatrix.mjs`:

| Aspect               | Observed                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key field name       | `` `${rowField}\${columnField}` `` from the **option strings**, e.g. `source\target`, or `client\server`                                                                                    |
| Key field type       | Copied from the row field — **`number` when node ids are numeric** (measured), which breaks "first string field"                                                                            |
| Column order         | `Array.from(new Set(targets))` — **first appearance**, not sorted                                                                                                                           |
| Row order            | Same, over sources                                                                                                                                                                          |
| Squareness           | **Not square.** A node that is never a target gets no column; never a source, no row                                                                                                        |
| Column type / config | Copied from the value field, **shared by reference across every column**; `unit`, `decimals` and `color.mode` are inherited, and `displayName` is `delete`d from the _input_ field's config |
| `refId` / `meta`     | **Both unset.** `return [{ fields, length }]` — so `meta.type` cannot survive the pivot                                                                                                     |
| Default `emptyValue` | `SpecialValue.Empty` → **`''` in a field still typed `number`**                                                                                                                             |
| Parallel edges       | **Last row silently wins** (measured: a→b of 10 then 20 yields 20)                                                                                                                          |
| Multi-frame input    | **No-op.** `if (data.length !== 1) return data`                                                                                                                                             |

Two of those are load-bearing enough to be normative.

**The diagonal is semantic, never positional.** Rows follow first-appearance source
order and columns first-appearance _target_ order, and the two orders differ in general.
Measured on the fully connected fixture: rows `a, b, c` but columns `b, c, a`, so the
frame is square and still not diagonal-aligned — cell (0, 0) is `a-->b`, not `a-->a`.
Measured with a self-loop (`a-->b`, `b-->a`, `a-->a`): columns `b, a`, and the self-loop
sits at row 0 of column `a`.

> **Normative: a self-loop is the cell where the row key equals the column name. A
> reader MUST compare the row key against the field name and MUST NOT index the
> positional diagonal.**

**Absent means absent, in three spellings.** `''` from `csv_content`, `null` from
`groupingToMatrix` with `emptyValue: 'null'`, and `''` from `groupingToMatrix`'s
_default_ `emptyValue` all mean no edge. Only `0` means an edge of weight zero, and CSV
preserves that distinction (measured: `source,a,b,c / a,0,10,20 / …` gives `0`, not
`null`).

> **Normative: `null`, `undefined`, `''` and any non-finite value are **no edge**. `0`
> is an edge of weight `0`. `emptyValue: 'zero'` MUST NOT be used — it invents an edge
> for every absent pair** (measured: the chain fixture's two absent cells both become
> `0`, i.e. two phantom edges), **and `emptyValue: 'null'` SHOULD be set explicitly,
> because the default leaves `''` inside a field declared `number`.**

And the contract for missing rows and columns:

> **Normative: the node set is the union of the row-key values and the numeric field
> names.** A node with a row and no column is a source-only node (a root); with a column
> and no row, a sink. Both are legal and both are common — the two-node chain
> `a-->b-->c` pivots to rows `a, b` and columns `b, c`, so one of three nodes has no
> column and one has no row. A reader MUST NOT assume squareness, MUST NOT assume the
> orders agree, and MUST NOT require a column for every row.

The consequence for configuration is uncomfortable and should be stated plainly:
**per-node addressability in a matrix is asymmetric by default.** Sink and interior nodes
have fields; source-only nodes do not. On a service map, that means the ingress gateway —
usually the node a user most wants to name — is the one node with no override target,
unless the matrix is padded to square or a nodes frame is supplied.

## Detection, and the collision with the heatmap

The matrix frame's shape is: one leading `string` field, then numeric fields. That is
**byte-for-byte what `frameToMatrixHeatmap` consumes** (`findCategoricalFrame` +
`findCategoryField` + `mapNumericFields`, see
[heatmap-matrix.md](./heatmap-matrix.md#how-a-frame-is-read)) and also what
[categorical.md](./categorical.md) consumes for bar charts. Demonstrated live: the same
adjacency CSV renders as a matrix heatmap in the ECharts Heatmap panel, unchanged.

So unlike the other two graph shapes, **the matrix has no reliable field-shape
signal.** The long form has `source` + `target`; the wide form has endpoint labels or
`-->` in field names. A matrix has nothing a `numeric-wide` frame does not have.

The best available heuristic is the **row-key / column-name overlap**: in a graph matrix
the column names are drawn from the same identifier space as the row-key values, so
`columns ∩ rowKeys ≠ ∅`, whereas a heatmap matrix's axes are usually unrelated
(`hour × weekday`, `service × status`). A backslash in the key field name
(`source\target`) is a second, weaker hint that `groupingToMatrix` produced it. Neither
is sound: a symmetric heatmap (`service × service` correlation) satisfies both.

> **Normative: `graph-edges-matrix` MUST NOT be selected by field shape alone.**
> Resolution order: `meta.type === 'graph-edges-matrix'`, then the explicit `dataFormat`
> panel option, and **no shape fallback**. The overlap heuristic is at most a
> suggestion-scoring signal.

This is a real difference from
[graph-wide.md's role resolution](./graph-wide.md#frame-role-resolution), where field
shape is deliberately load-bearing because `meta` does not survive reshaping. Here `meta`
does not survive either — `groupingToMatrix` emits none — so the **panel option is the
primary signal**, and that is a UX cost paid on every panel.

## Sourcing

Compared honestly against the edge-per-field story in
[graph-wide.md](./graph-wide.md#sourcing) and
[relations-data-sources.md](../docs/relations-data-sources.md#sourcing-the-wide-form).

| Source                                   | To `graph-edges-wide`                                   | To `graph-edges-matrix`                                                           |
| ---------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Hand-authored `csv_content`              | 1 query, no transforms (no labels, no config)           | **1 query, no transforms** — and the shape is legible as a table                  |
| SQL (an edges table)                     | 1 `rowsToFields`                                        | 1 `groupingToMatrix`, **or** a conditional-aggregation pivot in the SQL           |
| Prometheus / Loki                        | 0 transforms — `format: time_series` + a `legendFormat` | 1 `groupingToMatrix` — but `format: table`, and **`format: time_series` no-ops**  |
| Tempo / X-Ray / TestData `node_graph`    | 1 `rowsToFields`, both frames at once                   | **`filterByRefId` first, discarding the nodes frame** — then 1 `groupingToMatrix` |
| Native (`meta.type` set by a datasource) | Nothing exists yet                                      | Nothing exists yet                                                                |

### `groupingToMatrix` is cheaper than expected in one way

No `convertFieldType` is needed. `csv_content` already types a numeric column as
`number` (measured: `id,source,target,mainstat` arrives with `mainstat` typed), and
Prometheus's `Value` is numeric, so the pivot is genuinely **one transformation**.
Better, its `valueField` **defaults to the literal string `Value`**, so on a Prometheus
instant query in `format: table` you set only Column and Row. Measured on a frame shaped
exactly as Prometheus emits (`Time`, `client`, `server`, `Value`): output key field
`client\server`, one column per server, values intact.

### And much more expensive in one way

**`groupingToMatrix` no-ops on any response with more than one frame.** Measured live:
an edges CSV plus a nodes CSV in the same panel, with the pivot configured, renders the
**untransformed edges frame**. The guard is `if (data.length !== 1) return data`.

Grafana has no per-query transformations, so within one panel a `groupingToMatrix` matrix
and a nodes frame **cannot coexist**. The only way to run the pivot is to drop the other
frame first — measured working with `filterByRefId` include `A`, which of course deletes
the node metadata you were trying to keep.

Contrast `rowsToFields`, which maps over **every** frame: measured, a nodes + edges pair
goes in and a `graph-nodes-wide` + `graph-edges-wide` pair comes out, in one
transformation, with zero options and correct labels on both. **That asymmetry is the
single biggest practical difference between the two wide forms**, because the population
it hurts is exactly the one that already emits graph data natively — Tempo, X-Ray,
TestData — all of which return both frames.

So the matrix's realistic producers today are: a hand-authored CSV, an edges-only query,
or a datasource that emits the shape natively (none does). Everything else pays either
the loss of the nodes frame or a second panel.

### Can SQL emit a matrix directly?

Partly. Grafana's SQL Expressions dialect is MySQL via
[`dolthub/go-mysql-server`](https://github.com/dolthub/go-mysql-server), and MySQL has no
`PIVOT` operator. A matrix is expressible by conditional aggregation —
`SUM(CASE WHEN target = 'api' THEN calls END) AS api`, one clause per target — and `CASE`
is on the allow-list (`pkg/expr/sql/parser_allow.go`, per
[relations-data-sources.md](../docs/relations-data-sources.md#reshaping-with-sql-expressions)).
The catch is structural: **the column list must be enumerated in the SQL**, so the node
set is fixed at authoring time and a new service does not appear until someone edits the
query. Native-dialect datasources with a real pivot (MSSQL/Oracle `PIVOT`, Postgres
`crosstab`) are better placed, and the same static-column caveat applies. _Unverified —
no SQL datasource is provisioned in this instance; the dialect and allow-list facts are
carried over from the existing sourcing doc._

Prometheus and Loki cannot emit the shape without the transform: a PromQL result is a set
of label-keyed series, and a series cannot become a column keyed by another series' label.

## ECharts mapping

Unchanged at the boundary. `graph`, `sankey` and `chord` all read
`option.edges || option.links` plus `option.data || option.nodes`
([node-graph.md](./node-graph.md#echarts-data-specification)), so a matrix reader
materialises the same `{ nodes, links }` model the other two shapes produce, and the
variant switch stays a layout change.

The cell → link rules, in order:

1. **The node set** is the union of the row-key values and the numeric field names,
   first-appearance order (row keys first) so palette indices stay stable across renders.
2. **For every (row r, column c)**: read `field_c.values[r]`. **Skip** `null`,
   `undefined`, `''` and any non-finite value — there is no edge. Do not skip `0`.
3. **Direction is row → column**, always. `source = rowKey[r]`, `target = field_c.name`.
4. **Self-loop** when `rowKey[r] === field_c.name`. Compare identifiers, never indices.
5. **Weight** is the cell value. There is no fallback chain — no `thickness`, no `1`
   default — because a cell that is not a number is not an edge.
6. **Edge id** is synthesised as `` `${rowKey[r]}-->${field_c.name}` ``, which matches
   what the edge-per-field form names the same edge, so snapshots and parity fixtures
   line up across shapes. A node id containing a literal `-->` must be escaped `\-->`,
   per the separator rule in [graph-wide.md](./graph-wide.md#the-separator).
7. **Style and colour** come from `field_c.display(cellValue)` and `field_c.config`, per
   [What a cell can carry](#what-a-cell-can-carry--the-whole-argument-in-one-section).
8. **Data links** come from `field_c.getLinks({ valueRowIndex: r })`. This is not
   speculative plumbing: the matrix heatmap tooltip already resolves a cell to exactly
   this `{ field: xFields[xIndex], rowIndex: yIndex }` pair for its data-link footer
   (`src/lib/echarts/tooltip/matrixHeatmap.ts`).

### The cycle policy hurts a matrix much more than the other shapes

`converters/dag.ts` runs unconditionally on the sankey path: self-loops dropped, parallel
pairs merged, back-edges dropped by a deterministic DFS. Two of those three interact
strongly with a matrix, and the third becomes dead code.

Measured by running the real `toSankeyLinks` over the link set a complete N-node matrix
materialises:

| Input                            | Links in | Kept | Dropped | Kept set                  |
| -------------------------------- | -------: | ---: | ------: | ------------------------- |
| Complete K3, no diagonal         |        6 |    3 |       3 | `n0>n1`, `n0>n2`, `n1>n2` |
| Complete K5                      |       20 |   10 |      10 | upper triangle            |
| Complete K10                     |       90 |   45 |      45 | upper triangle            |
| Complete K30                     |      870 |  435 |     435 | upper triangle            |
| Complete K3 with a full diagonal |        9 |    3 |       6 | upper triangle            |
| Symmetric pair (`a↔b`, `b↔c`)    |        4 |    2 |       2 | `a>b=5`, `b>c=7`          |

So: **a sankey over a dense matrix discards exactly half of it** — the lower triangle in
first-appearance order — plus the whole diagonal. That is deterministic and it is
correct (the alternative is ECharts' unguarded production `throw` in `sankeyLayout.ts`),
but it means a fully populated matrix is a `graph` or `chord` input, not a sankey one, and
the panel's dropped-links notice will read like a bug report. An **undirected** graph
encoded symmetrically loses one direction of every edge and keeps the weight
un-doubled — measured, `a>b` survives at 5 rather than 10 — which is the right answer
but only by accident.

`mergeParallelLinks` becomes **unreachable** from a matrix: one cell per ordered pair
means duplicates cannot exist. That is the one place the matrix simplifies the pipeline.

## UX at N=30

This is where the shapes stop being equivalent. Measured in the real override editor,
against two live panels holding a 30-node graph — a 31-field matrix and an 870-field
edge-per-field frame — by walking the virtualized combobox and collecting every option:

| Question                              | Matrix                           | Edge-per-field                       |
| ------------------------------------- | -------------------------------- | ------------------------------------ |
| Entries in the `byName` picker        | **31**                           | **870**                              |
| Typing `n7` narrows to                | **1** — `n7`                     | **58** — every edge incident on `n7` |
| Can you select "the node `n7`"?       | **Yes**, exactly                 | **No.** No such field exists         |
| Can you select "the edge `n7-->n12`"? | No                               | **Yes**, exactly                     |
| Time to open the picker               | ~50 ms                           | ~50 ms                               |
| First entry in the list               | `source` — the key field, a trap | `n0-->n1`                            |

The latency finding is worth recording because it contradicts the intuition in
[graph-wide.md's limits](./graph-wide.md#limits-and-divergences): at 870 short,
unlabelled field names the picker opens instantly in both shapes. The 4-second figure
there came from long **labelled** display names, so display-name _length_ is the
bottleneck, not count. Which means **the real UX difference is precision, not speed**:
in a matrix a node id is a unique query, and in the edge-per-field form a node id is a
58-way disambiguation with no correct answer.

What a user has to understand to configure each shape:

| Shape          | The mental model they must hold                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Long           | Nothing — and they can configure nothing. The picker lists `id, source, target, mainstat` for any size of graph                                                                                |
| Edge-per-field | "A field is an edge." One idea. The picker's contents match it exactly, and the node/edge split is the frame split                                                                             |
| **Matrix**     | "A column is a node **and** its inbound edges, depending on which property I set." Plus: the key column is not a field to configure, some nodes have no column, and the diagonal is self-loops |

The matrix asks for strictly more understanding, and the thing it asks the user to
internalise — the identity/value split — has no analogue anywhere else in Grafana's
configuration model. Against that, it is the only shape whose picker is navigable at
N=30, and the only shape a user can read as a table and check by eye.

**Discoverability.** The matrix is discoverable in the sense that "Grouping to matrix" is
a stock transformation with an obvious name, and the resulting table is
self-explanatory. It is surprising in four measured places: the key column is named
`source\target`; the columns are not sorted; the frame is not square; and a nodes frame
in the same panel silently disables the pivot. The edge-per-field form is surprising in
one place (a `csv_content` fixture cannot carry labels, so parallel edges are
unauthorable). Four surprises to one.

## Migration cost, compared

Against the phase list in
[graph-wide-migration.md](../todo/graph-wide-migration.md#phase-order). The assumption
under test is "migration has similar costs to wide". **Mostly true, with two phases
where it is not.**

| Phase                                 | Shared with the wide plan?             | Delta for the matrix                                                                                                                                                                                                               |
| ------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** — core pipeline prefix          | **Fully shared, and equally blocking** | The [downstream-of-overrides asymmetry](../todo/graph-wide-migration.md#the-one-asymmetry-that-shapes-everything) is identical: an in-panel pivot runs after `applyFieldOverrides`, so it can render but never enable overrides    |
| **1** — model, adapter, stop throwing | Shared model; **detection diverges**   | A **third** shape test that cannot be a shape test (above), so `dataFormat` gains a fourth value and the matrix is opt-in rather than auto. The `legacyToMatrix` adapter cannot delegate to `groupingToMatrix` for two-frame input |
| **2** — the wide reader               | **A second reader, not a variation**   | `fields.map(f => link)` versus a `columns × rows` walk with a skip predicate and a semantic-diagonal test. Similar size; no shared body. **And the reduce contract must be suppressed**, which is an editor change                 |
| **3** — delete the colour path        | **Fully shared**                       | `field.display(value).color`, called per cell instead of per field. `makeRelationsColorResolver` dies once for both                                                                                                                |
| **4** — per-mark custom config        | Partly                                 | Node customs land on column nodes only; edge customs land per **bundle**. `custom.hideFrom` needs a documented meaning (hides node + bundle)                                                                                       |
| **5** — tooltip, links, legend        | **Fully shared, and cheaper here**     | Per-cell link resolution already exists in this repo for this exact frame shape (`tooltip/matrixHeatmap.ts`)                                                                                                                       |
| **6** — docs and provisioning         | Additive                               | The matrix fixtures are the shortest of the three and need no transforms, so provisioning gets easier, not harder                                                                                                                  |

**One reader or two?** **Two readers over one model** — and the honest framing is that
they are less similar than they look. They agree on the internal model
(`NodeGraphData`), on colour resolution, on link resolution and on edge ids. They
disagree on the frame walk, on detection, on whether `reduceOptions` exists, and on
whether a time dimension is possible. That last pair means the divergence reaches the
**editor**, not just the converter: the Value options and the row-dimension story are
present for one shape and absent for the other.

Set against the plan's own accounting, this is roughly the same size as keeping the
legacy reader — [_"keeping legacy costs one function; dropping it saves one
function"_](../todo/graph-wide-migration.md#what-it-would-actually-delete). Supporting
the matrix costs one more reader plus one conditional in the editor. It is not free, and
it is not a phase-order change.

The plan's release gate applies unchanged and is arguably worse: with no shape
detection, no surviving `meta`, and `groupingToMatrix` disabled by the presence of a
nodes frame, **the matrix has no zero-configuration path from any datasource that exists
today.** Every path is either a hand-authored fixture or a user-configured panel.

## Performance

One section, by reference. The measured table is
[graph-wide.md § Performance](./graph-wide.md#performance-which-frame-shape-is-cheapest)
and the matrix wins it outright: at 9 900 edges over 100 nodes it is **101 fields,
0.3 ms of `applyFieldOverrides`, 50 kB and 101 picker entries**, against 9 900 fields /
20.9 ms / 586 kB / 19 800 entries for edge-per-field — and cheaper on payload than even
the long form, which repeats the endpoint strings on every row. Re-measured here on
field counts and payload only, in agreement: N=30 is 31 fields / 3 kB versus 870
fields / 42 kB; N=100 is 101 fields / 31 kB versus 9 900 fields / 488 kB.

That is settled, and it is **not** the reason to adopt or reject the shape. A graph of
9 900 edges is unreadable at any frame cost, so the numbers only matter as a ceiling:
they say the matrix will not be the thing that breaks, at any density a user might
plausibly ask for. ECharts is neutral either way — all four relationship series read
hand-built arrays and never see a `dataset`.

## Verdict

**Keep it as a documented alternative _form_ of the graph kind — as
[graph-wide.md](./graph-wide.md) already has it — with one correction: give it its own
`meta.type` string, `graph-edges-matrix`, and make it explicitly opt-in rather than
shape-detected.** Not a separate minted kind: the kind is `graph`, the role is `edges`,
only the shape differs, and it pairs with the same `graph-nodes-wide` companion frame.
Not "not worth supporting": the N=30 picker numbers and the zero-transform CSV are too
good to throw away, and the reader is a bounded amount of work sitting on top of a frame
layout this plugin already consumes.

Three things must change in the current text of
[graph-wide.md](./graph-wide.md#dense-graphs-the-adjacency-matrix-variant) for it to be
accurate:

1. **"Per-edge colour, links, hiding and curveness are not available"** → per-edge
   colour and links **are** available, resolved from the cell's value; hiding and
   curveness are per bundle. The correct dividing line is identity versus value.
2. **"A `byName` override on a matrix column targets the node"** → it targets the node's
   identity **and** its inbound bundle's values, inseparably, and it also hits a
   same-named field in a nodes frame.
3. **Field shape as a fallback signal** → not available for this shape at all; it
   collides with `heatmap` matrix and `numeric-wide`, demonstrably (the same CSV renders
   as a matrix heatmap today).

**The condition that would change the answer, in both directions.**

Promote it to a first-class reader (or a minted kind) when **a datasource emits it
natively with `meta.type` set** — a Tempo service graph as a matrix is the obvious
candidate — because that removes the detection problem, the `groupingToMatrix` two-frame
no-op and the nodes-frame conflict in one move, and it is the point at which a dense
service map becomes a zero-configuration render. A core `ValueMatcher` or a `'cell'`
`MatcherScope` (both of which
[already half-exist](./graph-wide.md#relation-to-fieldconfigitemoverrides)) would do the
same for per-edge identity.

Demote it to a fixture format — documented in this folder, not implemented in the panel
— if that never happens. With no native producer, no shape detection and a pivot that a
nodes frame disables, its only real users are hand-authored CSVs and dashboards someone
configured by hand, and a second reader plus an editor conditional is a poor trade for
that. **The decisive test is whether anything other than a human ever produces one.**

## Worked examples

Every CSV below is literal `csv_content`, pasted into a TestData query and confirmed to
render. None needs a transformation.

### 1. Dense — 3 nodes, 6 edges

```csv
source,a,b,c
a,,10,20
b,30,,40
c,50,60,
```

Four fields for six edges; at 30 nodes it is 31 fields for 870 edges. The blank diagonal
is **no edge**, not zero. Key field `string`, columns `number` with `null` — measured.

### 2. Explicit zero weights

```csv
source,a,b,c
a,0,10,20
b,30,0,40
c,50,60,0
```

Three self-loops of weight `0`. This renders differently from example 1 and must:
`0` is an edge.

### 3. Unweighted

```csv
source,a,b,c
a,,1,1
b,1,,
c,,1,
```

The classic adjacency matrix. `1` is present, blank is absent. The cleanest unweighted
encoding of the three shapes — the long form needs a `mainstat` column of ones and the
wide form needs one field per edge.

### 4. Non-square — the chain `a-->b-->c`

```csv
source,b,c
a,420,
b,,380
```

Two rows, two columns, three nodes. `a` has no column and `c` has no row, which is what
`groupingToMatrix` emits for this graph (measured). `a` is therefore **not addressable**
by any override — the shape's sharpest wart, and it is the ingress node.

### 5. Self-loop with permuted columns

```csv
source,b,a
a,10,90
b,,20
```

Rows `a, b`; columns `b, a`. The self-loop `a-->a` is at row 0 of column `a` — **not**
the positional diagonal. This is the exact column order `groupingToMatrix` produces for
`a-->b`, `b-->a`, `a-->a` (measured), so a reader that indexes the diagonal reads
`a-->b` as a self-loop.

### 6. An isolated node

```csv
source,a,b,z
a,,10,
b,30,,
z,,,
```

`z` has no edges. It reaches the node set as a **row key**; its column is all-blank and
degrades to `type: string` under `csv_content` (measured), so it is a node without a
field. Neither other shape can express an isolated node without a nodes frame at all.

### 7. The key column as `groupingToMatrix` names it

```csv
source\target,a,b
a,,10
b,30,
```

A backslash survives a CSV header and a field name intact (measured, rendered). It does,
however, break `${__data.fields["source\target"]}` in a data link — use
`${__data.fields[0]}`.

### 8. From the legacy edges frame, one transformation

```csv
id,source,target,mainstat
a-->b,a,b,10
a-->c,a,c,20
b-->a,b,a,30
b-->c,b,c,40
c-->a,c,a,50
c-->b,c,b,60
```

With one `groupingToMatrix` (Column `target`, Row `source`, Cell `mainstat`, Empty
`null`) and **no `convertFieldType`** — measured rendering as `source\target | b | c | a`
over rows `a, b, c`.

Add a second query returning a nodes frame and the pivot **silently stops happening**
(measured): the panel shows the raw edges frame. `filterByRefId` include `A` restores the
pivot by deleting the nodes frame.

### 9. Per-node and per-edge configuration on one matrix

The same CSV as example 1, with two overrides:

| Override                                       | Effect (measured live)                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `byName: 'a'` → `displayName`, `unit`, `links` | Column header reads `Gateway (node a)`; cells `30`/`50` render `req/s`; hrefs `http://h/b/to/a?w=30` and `http://h/c/to/a?w=50` |
| `byName: 'c'` → `mappings` on `40`             | The single cell `(b, c)` reads `the b-->c edge` in purple; its neighbours are unchanged                                         |

One override configured a node's label, its whole inbound bundle's unit, and three
per-edge URLs. The second styled exactly one edge, by its value.

### `toDataFrame` equivalents

```typescript
import { FieldType, toDataFrame } from '@grafana/data';

/** graph-edges-matrix, hand-authored: absent cells are null, not 0. */
const matrix = toDataFrame({
  refId: 'A',
  meta: { type: 'graph-edges-matrix', typeVersion: [0, 1] },
  fields: [
    { name: 'source', type: FieldType.string, values: ['a', 'b', 'c'] },
    { name: 'a', type: FieldType.number, values: [null, 30, 50] },
    { name: 'b', type: FieldType.number, values: [10, null, 60] },
    { name: 'c', type: FieldType.number, values: [20, 40, null] },
  ],
});

/** As `groupingToMatrix` emits it: no refId, no meta, permuted columns, backslash key. */
const pivoted = toDataFrame({
  length: 3,
  fields: [
    { name: 'source\\target', type: FieldType.string, values: ['a', 'b', 'c'] },
    { name: 'b', type: FieldType.number, values: [10, null, 60] },
    { name: 'c', type: FieldType.number, values: [20, 40, null] },
    { name: 'a', type: FieldType.number, values: [null, 30, 50] },
  ],
});

/** Non-square: the chain a-->b-->c. `a` has no column, `c` has no row. */
const chain = toDataFrame({
  length: 2,
  fields: [
    { name: 'source\\target', type: FieldType.string, values: ['a', 'b'] },
    { name: 'b', type: FieldType.number, values: [420, null] },
    { name: 'c', type: FieldType.number, values: [null, 380] },
  ],
});
```

## Verified behaviours

Everything above that is not reasoning. **Grafana 13.1.0** (commit `b309c9b`,
enterprise), `@grafana/data` 13.1.1, ECharts 6.1.0. Probes ran against the host's own
module graph (`System.import('@grafana/data')`), against `/api/ds/query` for frame
typing, against the real override editor for picker behaviour, and against this repo's
own `toSankeyLinks` under jest for the cycle policy.

| #   | Claim                                                                | Verdict                            | Observed                                                                                                                                    |
| --- | -------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Matcher registry has no cell or row concept                          | **Confirmed**                      | 12 registered matchers, all `(field, frame, allFrames) => boolean`; the picker offers 5                                                     |
| 2   | `DataFrameType` still has no graph member                            | **Confirmed**                      | The same twelve members as `graph-wide.md` records                                                                                          |
| 3   | A matrix CSV needs no transformation                                 | **Confirmed**                      | Key `string`, columns `number`, blanks `null`, straight from `csv_content`                                                                  |
| 4   | An all-blank CSV column is not a node                                | **Confirmed**                      | Degrades to `type: string`, so a numeric-field reader drops it                                                                              |
| 5   | `groupingToMatrix` key field name                                    | **Confirmed**                      | `source\target` / `client\server` — built from the **option strings**, not the field names                                                  |
| 6   | Column and row order                                                 | **Confirmed: first appearance**    | Dense fixture: rows `a, b, c`, columns `b, c, a`. The frame is square and not diagonal-aligned                                              |
| 7   | The diagonal is semantic, not positional                             | **Confirmed**                      | Self-loop fixture: columns `b, a`; `a-->a` sits at row 0 of column `a`                                                                      |
| 8   | Default `emptyValue`                                                 | **Confirmed, and a trap**          | `SpecialValue.Empty` → `''` inside a field typed `number`. `'zero'` invents weight-0 edges. `'null'` must be set                            |
| 9   | Parallel edges through the pivot                                     | **Confirmed: silent data loss**    | Two rows for `a-->b` (10, then 20) yield a single cell of `20`                                                                              |
| 10  | `groupingToMatrix` on a multi-frame response                         | **Confirmed: no-op**               | Live panel with nodes + edges renders the raw edges frame. `if (data.length !== 1) return data`                                             |
| 11  | `rowsToFields` on the same input                                     | **Confirmed: maps every frame**    | One transform, zero options → `graph-edges-wide` + `graph-nodes-wide`, labels correct on both                                               |
| 12  | Column config is inherited from the value field                      | **Confirmed**                      | `unit`, `decimals`, `color.mode` copied; `displayName` `delete`d from the **input** field; all columns share one config object by reference |
| 13  | Numeric node ids                                                     | **Confirmed: breaks the key test** | Key field arrives `type: number`; columns are stringified numbers                                                                           |
| 14  | A string value field                                                 | **Confirmed**                      | Columns pivot to `type: string`, so an X-Ray-shaped matrix yields zero nodes                                                                |
| 15  | The pivot emits no `refId` and no `meta`                             | **Confirmed**                      | `return [{ fields, length }]` — `meta.type` cannot survive                                                                                  |
| 16  | A column's display processor runs per cell                           | **Confirmed**                      | Continuous scheme, thresholds and value mappings all resolve against one cell's value                                                       |
| 17  | A value mapping can isolate one cell                                 | **Confirmed**                      | `mappings` on `40` styled only `(b, c)`; live panel shows `the b-->c edge`                                                                  |
| 18  | Absent cells still resolve a colour and a link                       | **Confirmed**                      | `display(null)` → `text: ''` with a colour; `getLinks` builds `http://h/a/to/a?w=`                                                          |
| 19  | One `links` override yields per-cell hrefs                           | **Confirmed, live**                | `http://h/b/to/a?w=30`, `http://h/c/to/a?w=50` from one override on column `a`                                                              |
| 20  | `${__data.fields[0]}` resolves the row key; the named form fails     | **Confirmed**                      | Bracket and dot accessors both resolve empty against `source\target`; positional works for any key name                                     |
| 21  | `state.range` on a matrix                                            | **Confirmed: frame-global**        | Every column got `{min: 10, max: 60}` — one colour domain across all edges, which is what a graph wants                                     |
| 22  | `byValue` selects columns, not cells                                 | **Confirmed**                      | `{max, gte, 60}` matched column `b` alone — "nodes whose worst inbound edge ≥ 60"                                                           |
| 23  | `byName` on a node id hits the matrix column **and** the nodes frame | **Confirmed**                      | One override set `dark-red` + `ms` on both frames' field `a`                                                                                |
| 24  | `byFrameRefID` separates the two roles                               | **Confirmed**                      | `decimals: 3` reached the nodes frame only. No matcher conjunction exists, so this is all-nodes granularity                                 |
| 25  | `byRegexp` works on matrix column names                              | **Confirmed**                      | `/^[abc]$/` matched all three columns — the display name equals the raw name, unlike a labelled wide frame                                  |
| 26  | Override picker at N=30                                              | **Confirmed**                      | Matrix 31 entries, `n7` → **1**. Edge-per-field 870 entries, `n7` → **58**. Both open in ~50 ms                                             |
| 27  | The key field is offered in the picker                               | **Confirmed**                      | `source` is the first entry; overriding it does nothing to the graph                                                                        |
| 28  | Sankey over a complete matrix                                        | **Confirmed**                      | Upper triangle survives: K30 → 435 of 870 kept, 435 dropped. K3 with a full diagonal → 3 of 9                                               |
| 29  | Sankey over a symmetric matrix                                       | **Confirmed**                      | One direction kept, weight **not** doubled (`a>b=5`)                                                                                        |
| 30  | The relations panel today                                            | **Confirmed: throws**              | `source,a,b,c` CSV renders _"An unexpected error happened"_, exactly as a wide frame does                                                   |
| 31  | The same CSV as a matrix heatmap                                     | **Confirmed: renders**             | ECharts Heatmap panel, `chartType: matrix`, canvas ink at N=3 and N=30 — the detection collision, live                                      |

## References

- Grafana data plane contract (kinds, versioning, "propose a new type"):
  https://grafana.com/developers/dataplane/
- The wide contract this compares against: [graph-wide.md](./graph-wide.md)
- The legacy row format: [node-graph.md](./node-graph.md)
- The same frame layout, already consumed: [heatmap-matrix.md](./heatmap-matrix.md), and
  the shared model in [categorical.md](./categorical.md)
- Rewrite plan whose phases this costs against:
  [../todo/graph-wide-migration.md](../todo/graph-wide-migration.md)
- Sourcing guide, including the matrix recipe:
  [../docs/relations-data-sources.md](../docs/relations-data-sources.md#dense-graphs--grouping-to-matrix)
- Grouping to matrix (user-facing docs):
  https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/#grouping-to-matrix
- `groupingToMatrix` implementation — unlike `rowsToFields`, it ships **inside**
  `@grafana/data` (`dist/esm/transformations/transformers/groupingToMatrix.mjs`):
  https://github.com/grafana/grafana/blob/v13.1.0/packages/grafana-data/src/transformations/transformers/groupingToMatrix.ts
- Field overrides (user-facing):
  https://grafana.com/docs/grafana/latest/panels-visualizations/configure-overrides/
- Cycle policy this shape stresses: `src/lib/echarts/converters/dag.ts`, and the
  unguarded ECharts throw it exists for:
  https://github.com/apache/echarts/blob/6.1.0/src/chart/sankey/sankeyLayout.ts
- Per-cell data-link precedent in this repo: `src/lib/echarts/tooltip/matrixHeatmap.ts`
- Proof dashboard for the wide contract, whose panel 10 is the matrix:
  `provisioning/dashboards/relations/graph-wide.json`
