# Release the Relations panel

## Status

The repository can build the standalone Relations panel with `pnpm run build:relations`.
The approved plugin ID is `grafana-echarts-relations-panel`.
The release workflow does not yet build, sign, validate, and retain one immutable Relations archive.

The next milestone is a standalone Relations archive that CI signs and validates.
Cloud dev and ops must use the same archive bytes.
The dataViz move, shared build work, and automatic deployment are later work.

## Decisions before implementation

1. Use the approved plugin ID, `grafana-echarts-relations-panel`.
2. Choose the package license.
   `package.json` and `LICENSE` currently use Apache-2.0.
   A change to AGPL needs legal or team approval.
3. Decide whether system transformations block the first release.
   If they block release, the upstream stack is a release gate.
   If they do not, document the wide-frame requirement for the first release.
4. Record the Cloud dev target, Cloud ops target, release owner, and promotion approver.
5. Record the previous ops artifact and its rollback procedure before ops promotion.

## Release gates

### 1. Apply the approved plugin ID (complete)

Update the Relations manifest, dashboard panel types, generators, translation initialization, tests, and provisioning.
Restart Grafana after the manifest changes.

### 2. Build one standalone panel

Add an explicit Relations production mode in `webpack.config.ts`.
Keep the current multi-panel development build.

The production build must:

- Write `module.js` at the archive root.
- Copy `src/modules/relations/plugin.json` to root `plugin.json`.
- Copy the Relations logo, README, changelog, and license.
- Exclude the app manifest and the other panel families.
- Use the approved plugin ID for public paths and translations.
- Keep the current asynchronous ECharts chunk behavior.

### 3. Freeze the Cloud artifact metadata

The current versions do not describe one tested release baseline:

- `package.json` sets the plugin version to `1.0.0`.
- `package.json` pins `@grafana/*` packages to `13.1.1`.
- `.env` runs Grafana `13.1.0`.
- The Relations manifest requires Grafana `>=13.2.0`.
- npm reports `@grafana/data` `13.2.2` as latest on 2026-09-15.

Do not update the Grafana SDK packages or local runtime to Grafana 13.2 for the Cloud rollout.
Keep the plugin version independent from the Grafana version.
Record the source revision, plugin ID, plugin version, archive name, and checksum for the Cloud artifact.
Do not change this metadata between Cloud dev and ops.

### 4. Replace catalog placeholders

`src/modules/relations/plugin.json` has no catalog links or screenshots.
Its description also needs final catalog text.
Root `README.md` is still the panel template.
`src/README.md` is still an HTML-commented template.
`CHANGELOG.md` contains only the unreleased `1.0.0` placeholder.

Write catalog text for the standalone Relations panel.
Use absolute links where the Grafana catalog requires them.
Capture screenshots from the provisioned Relations dashboards.

### 5. Resolve release-risk tests

Decide whether the save-and-reload test in `todo/relations-persistence-e2e.md` blocks release.
Run the focused dashboard and tooltip tests.
Run the repository checks before the release workflow creates the Cloud artifact.
Do not update canvas snapshots for this work.

### 6. Replace the scaffold release workflow

`.github/workflows/ci.yml` builds, signs, and packages the root app artifact.
It signs only when `GRAFANA_ACCESS_POLICY_TOKEN` exists.
`.github/workflows/release.yml` is the tag scaffold, and its signing input is commented out.

Select the supported release workflow for the target repository.
Make it package the standalone Relations artifact.
Define who owns the signing token and release action.
Build, sign, and validate one archive from the approved source revision.
Record the archive checksum, signature result, and validator result.
Retain the archive so that Cloud dev and ops use the same bytes.
Remove the ad hoc `sign` script only after the replacement works.

### 7. Roll out the immutable artifact to Cloud

Complete the local `relations-cloud-rollout-before-13-3.plan.md` plan.
Test the recorded archive on Cloud dev at Grafana `13.3.0-35049663052`.
After dev acceptance, compare the archive checksum with the recorded checksum.
Stop the promotion if the checksums differ.
Deploy the same archive bytes to ops and run the focused smoke tests.

### 8. Align with stable Grafana 13.3 for OSS

Wait until stable Grafana `13.3.0` packages and the runtime image are available.
Then complete the local `relations-align-grafana-13-3.plan.md` plan.
Align the SDK packages, local runtime, lockfile, and Relations manifest.
Run the full release checks on stable Grafana `13.3.0`.
Build a new OSS release candidate after this alignment.

The Cloud artifact does not establish the OSS compatibility baseline.

## Upstream status

The repository still detects the system-transformations API at runtime.
Do not state that system transformations shipped.

The checked status on 2026-09-15 is:

- Grafana 132104 and 132109 are open.
- Grafana 132111 and 132115 are open drafts.
- Scenes 1614 is open.
- Grafana 129992 and 132105 are closed.
- Grafana 132414 and 132419 are open follow-up work for Grafana 13.3.

## Later work

Keep these tasks out of the first artifact milestone:

- Move the package to the dataViz monorepo.
- Generalize the shared dataViz build.
- Automate catalog deployment and Argo installation.
- Promote the plugin to production or canary catalogs.
- Complete the local `e2e-interaction-coverage.plan.md` plan.
- Complete the low-priority local `silence-test-console-warnings.plan.md` plan.
- Complete the low-priority local `relations-value-sizing.plan.md` plan.

## Exit criteria

The production archive contains one panel manifest with the approved ID and version.
It contains root `module.js`, required assets, README, changelog, and license.
It contains no app manifest or other family.
CI signs and validates the same archive.
Cloud dev at Grafana `13.3.0-35049663052` loads the archive without the app wrapper.
Cloud dev and ops use the same recorded checksum.
The provisioned Relations dashboards render in Cloud dev and ops.
The release evidence records the chosen license, transformation gate, targets, owner, and approval.
Stable Grafana `13.3.0` alignment remains a required gate before the OSS release.
