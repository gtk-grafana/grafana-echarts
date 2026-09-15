# "Label overflow → Wrap" does not wrap

## Status

The ECharts `break` mode still clips labels instead of wrapping them. The reference dashboard uses the working `none` mode.

## Release impact

This behavior is a post-release correctness task. It does not block the Relations plugin release.

## What happens

`Label overflow` offers None / Truncate / **Wrap**. Wrap (`label.overflow: 'break'`) is
documented by ECharts as breaking a too-long label onto further lines at word boundaries.
It does not. Measured in a real browser by patching `CanvasRenderingContext2D.fillText`
and recording each draw's text and `y`, three nodes per panel, overlap-hiding off:

| `overflow` | label width             | what is drawn                                                    |
| ---------- | ----------------------- | ---------------------------------------------------------------- |
| `break`    | 70px                    | `"checkout-s"` — **one** line at one `y`, cut short, no ellipsis |
| `break`    | 70px, names with spaces | `"checkout "` — one line, cut at the space, no ellipsis          |
| `break`    | 40px                    | **nothing at all** — the label vanishes                          |
| `truncate` | 70px                    | `"checkout ..."` — one line, with an ellipsis                    |
| `none`     | 70px                    | `"checkout service eu west"` — the full name                     |

Each label is drawn twice (two render passes) at the _same_ `y`, so there is no second
line in any case: `break` produces a clipped single line that is strictly worse than
`truncate`, because it drops characters with nothing to signal that it did.

## What is not the cause

- **Not the fixture.** Tried longer names, names with real spaces (so there are word
  boundaries to break on) and widths from 40 to 70. Wrapping never happens; small widths
  make it worse by dropping the label entirely.
- **Not the option we emit.** `getRelationsLabelStyle`
  (`src/lib/echarts/relations/options/labels.ts`) emits exactly
  `{ overflow: 'break', width }` on the label, which is the documented shape, and `width`
  is deliberately emitted alongside because ECharts ignores `overflow` without it. The
  `truncate` and `none` paths through the same code work correctly, which rules out the
  option never reaching the series.

## Where to look next

Something is constraining the label's box to a single line's height, so zrender wraps and
then clips. Candidates, cheapest first:

1. `series.*.labelLayout` — the family always registers one for `hideOverlap`
   (`getRelationsLabelLayout`), and a `labelLayout` is already known to force
   `textConfig.local: false` on every host. Test with the callback returning `{}`.
2. A `lineHeight` or `height` on the label style, or one inherited from the theme via
   `getRelationsLabelStyle`'s `fontFamily`/`color` merge.
3. The node label `formatter` — `getRelationsNodeLabelFormatter` returns a single string;
   check whether zrender's `parsePlainText` is reached with a `truncate.outerHeight` that
   bounds it to one line.

## Meanwhile

The reference dashboard demos `none` rather than `break`, so it shows an option value that
works. **Consider dropping `Wrap` from the picker until this is fixed** — the same
reasoning that removed `Wrap anywhere` (`breakAll`) in the options reorg: an offered
choice that silently does something worse than its neighbour is worse than no choice.
`breakAll` was removed for splitting names mid-word; `break` currently does that _and_
loses the tail.
