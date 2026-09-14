## Project knowledge

This repository contains a **Grafana plugin**. You must Read @./.config/AGENTS/instructions.md before doing changes.

## Project goals

- Simple, clean, and maintainable code is the top priority.
- The current goal of this project is to support the Apache ECharts library as a panel plugin in Grafana
- This plugins should provide a simple user experience that aligns with core Grafana panels
- Grafana and EChart APIs should be isolated from each other whenever possible, preferably in different directories
- Any usage of Grafana or EChart APIs should contain links to the relevant documentation
- Editor options are tiered via a shared `editorMode` option (Default / Advanced / API); see [docs/options-modes.md](docs/options-modes.md)
- Dense cartesian charts auto-switch onto ECharts' big-data levers above density thresholds; see [docs/performance.md](docs/performance.md)

## Critical rules

- Push back on the prompter when scope of work conflicts with project goals.
- Ask for permission and clarity whenever ambiguities arise.
- Keep plans small and focused to the task at hand, do not make changes that were not explicitly requested
- Add comments to code, but keep them as concise as possible
- Adhere to data plane frame specifications: https://grafana.com/developers/dataplane/, except when explicitly told not to
- Create provisioned dashboards for all new panel functionality, prompt the user to check existing dashboards that can be impacted by a change
- Always use eCharts types instead of creating local definitions of the eCharts API. See https://echarts.apache.org/handbook/en/basics/import/#creating-an-option-type-in-typescript
- Assume data frames are square (all fields have the same number of values) and the frame length matches the value length.
- Don't update the jest snapshots in `*.canvas.test.*` tests!
- One kind of test per file, by name. `*.canvas.test.*`: **only** jest-canvas-mock
  baselines — every test asserts `toMatchCanvasSnapshot` and nothing else belongs there
  (`src/test/suiteShape.test.ts` fails the build otherwise). `*.integration.test.*`:
  renders that assert drawn primitives or compare two renders, no baseline. `*.test.ts`:
  unit tests, no infix. Splitting a claim out of a canvas suite is never scope creep.
- Stay on task & document out of scope context in the /todo directory
- **Family as filename until a kind holds three or more of them, then a family
  directory.** A chart family is normally a filename inside a kind directory
  (`options/pie.ts`, `charts/pie.ts`). Once one family owns three or more files in the
  same kind, it gets a directory instead — that is why
  `lib/grafana/editor/relations/`, `lib/components/canvas-tests/relations/` and
  `lib/echarts/relations/` exist while `src/editor/pie.ts` does not. Relations is the
  only family over the threshold today; `stream` and `part-to-whole` are the next
  candidates. A family directory nests **inside** the Grafana/ECharts split, never
  across it. No barrel `index.ts` files anywhere — imports name the concrete module.

## Development environment

    In a new worktree, the agent will need to pnpm i && pnpm run build to generate the dist directory.
    To generate non conflicting docker image, run `GRAFANA_PORT=4001 pnpm run server` and pick a different port number in the 4xxx range to avoid conflicting with the user images running on 3xxx
    Run .canvas tests with env variable `GEN_CANVAS_OUTPUT_ON_PASS=1` which will return a link to the `jest-canvas-mock-compare-viewer` tool which can be used to verify snapshots

## Canvas test coverage

    Which relations options a rendered test pins, where the suites live, and what a
    baseline costs: [docs/relations-canvas-coverage.md](docs/relations-canvas-coverage.md)

## Reviewing canvas snapshot changes

    Verify canvas output as images, and show them to the user when reviewing the task — never by reading draw-call JSON.
    1. `npx jest-canvas-mock-compare` (viewer on :5173, any port-5173 instance works — it takes an absolute `--root`, so one instance serves every worktree)
    2. `node scripts/canvas-shots.mjs --failing` writes one PNG per changed snapshot to `.jest-canvas-mock-compare/shots/` (gitignored). Omit `--failing` for all of them; drop `--root <dir>` in if the payloads are in another worktree.
    3. Read each PNG — a changed snapshot renders Expected | Actual | Diff in one image, so it is the before/after to hand the user. Include the paths in the summary.
    Run it from a checkout with node_modules installed (needs `@playwright/test` + `npx playwright install chromium`).
