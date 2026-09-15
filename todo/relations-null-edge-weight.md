# A null edge weight reports a fake `1`

> **Status: open, and now the family's only answer for a null edge.** Surfaced while
> auditing the standard options for the options-reorg (2026-09-14), which disabled
> `FieldConfigProperty.NoValue` for relations because nothing on the family's contract
> could reach it. That decision is right for the _node_ case and makes this one the
> remaining gap rather than one of two.

## What happens

`readEdges` coerces the reduced value on its way onto the link:

```ts
// src/lib/echarts/relations/converters/readEdges.ts
value: value ?? 1,
```

So an edge whose field reduces to `null` — every sample null over the range, or no sample
at the selected time-slider stop — is drawn at weight `1` and **reports `1`** in its
tooltip row and its edge label. There is no way for a reader to tell that apart from an
edge that genuinely measured 1.

The node half of the same question is handled, and handled deliberately: a null node stat
makes `buildRelationsTooltipModel` omit the value row outright
(`src/lib/echarts/relations/tooltip/model.ts`, with the reasoning in a comment — an empty
value under a "Value" label reads as a measurement that failed rather than one that was
not taken), and `getRelationsNodeLabelFormatter` falls back to the bare node name
(`src/lib/echarts/relations/options/labels.ts`).

## Why the coercion is there, and why it is only half wrong

The **geometry** genuinely needs a number: a sankey ribbon and a graph edge width are
computed from `value`, and `series.sankey` throws out of its layout on a non-numeric one.
Keeping `1` for layout purposes is correct — it is what makes
`timeline.integration.test.tsx` able to assert that the node set and link set are
identical at every slider stop, which is what makes a scrub legible as one graph changing
rather than several different graphs.

What is wrong is that the same coerced number is what the **display** path reads. Those
are separable: the link item could carry the layout weight and the original
possibly-null reduced value side by side.

## Fix sketch

1. Keep `value` as the layout weight, coerced exactly as now.
2. Add the un-coerced reduced value to the link model — `rawValue?: number | null`, beside
   the existing `field` reference.
3. `tooltip/model.ts` and `options/labels.ts` read `rawValue` and take the node path when
   it is null: omit the row, and emit `''` for the label (which `labels.ts` already does
   for a null it is handed).
4. Only then is re-enabling `FieldConfigProperty.NoValue` worth discussing, and it would
   be a third behaviour — print the field's "No value" text rather than omit the row. That
   is a **family-wide rendering change** and would want its own decision, because the node
   path deliberately omits rather than prints, and core only prints `noValue` in
   single-value panels (stat, bargauge). Do not treat re-enabling the option as the fix
   for this document.

## Cost

Small in code, wider in tests: `readEdges`, the link type, two display sites. The canvas
suites are unaffected (geometry does not move), but the tooltip and edge-label unit tests
gain a null case each, and `docs/relations-canvas-coverage.md` gains a row.
