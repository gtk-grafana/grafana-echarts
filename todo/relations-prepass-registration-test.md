# The relations pre-pass registration has no test of its own

## Problem

`modules/relations/module.tsx` is the one link in the derived-node chain with no direct
coverage. Everything either side of it is tested:

| Link                                                                                               | Test                                                                                            |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Which transformations a response needs                                                             | `modules/relations/dataTransformations.test.ts` (7 cases, one per shape)                        |
| Whether the host exposes the API, and the no-op when it does not                                   | `lib/grafana/panelDataTransformations.test.ts`                                                  |
| What the panel does with frames nobody converted                                                   | `converters/relationsGraph.test.ts` — _reports row-format frames rather than rendering nothing_ |
| That the derived-node pass changes no pixels, and that the override it enables is inert without it | `lib/components/relations-derived-nodes.integration.test.tsx`                                   |

What is untested is the single expression that connects them:

```ts
export const plugin = setDataTransformations(relationsPlugin, relationsDataTransformations);
```

Delete that call and every test above still passes. The panel would then reach a
row-format response unconverted and throw the "add a Rows to fields transformation"
error — which is the _designed_ fallback for an old host, so it does not read as a bug
from inside the code, only from the dashboard.

## Why it was left

Importing `module.tsx` under jest constructs a real `PanelPlugin`, which runs the whole
options supplier: `initPluginTranslations`, `useFieldConfig`, `addCommonLegendAndTooltip`
and the stats picker, every one of which reaches into a `standardEditorsRegistry` that
core fills and a plugin cannot. `editor/relations/advancedTier.test.ts` shows the shape
of the answer — stub the registry ids the builders ask for — but it registers the
_option builders_ directly rather than the plugin, which is a much smaller surface than
the whole module.

## What a test would look like

Mock `lib/grafana/panelDataTransformations`, import the module, and assert
`setDataTransformations` was called with `relationsDataTransformations`. That needs the
registry stub above plus a mock for `@grafana/i18n`'s `initPluginTranslations`, and it
would cover the other five families' modules just as well — which is the argument for
doing it once, generically, rather than for relations alone.

## Priority

Low. The expression is one line, it is covered end to end by a real Grafana pass over
`provisioning/dashboards/relations/`, and the failure mode is a visible error message
rather than a silent wrong render.
