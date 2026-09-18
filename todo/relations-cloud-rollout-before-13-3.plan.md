# Roll out Relations to Cloud before stable Grafana 13.3

## Goal

Deploy one immutable Relations artifact to Cloud dev and ops on the approved Grafana 13.3 Cloud build, without a temporary Grafana 13.2 SDK upgrade.

## Decisions

1. Skip the temporary Grafana 13.2 dependency and runtime upgrade.
2. Build one standalone Relations artifact from the approved source revision.
3. Test the artifact on Cloud dev at Grafana `13.3.0-35049663052`.
4. Promote the identical artifact to ops after dev acceptance.
5. Do not rebuild, repackage, or change the manifest between dev and ops.
6. Complete the stable Grafana 13.3.0 alignment before the OSS release.

## Rollout

### 1. Produce the immutable artifact

Complete the standalone Relations artifact gates in the master deploy-prep plan. Build, sign, and validate one archive. Record the source revision, plugin ID, plugin version, archive name, checksum, signature result, and validator result.

Do not change the Grafana SDK packages to 13.2 for this rollout. Do not create separate dev and ops builds.

### 2. Test on Cloud dev

Deploy the recorded archive to the Cloud dev target that runs Grafana `13.3.0-35049663052`. Confirm the runtime version before testing.

Open the provisioned Relations dashboards in a real browser. Check the graph, sankey, and chord panels, saved options, tooltips, data links, interactions, and resize behavior that are in release scope. Collect browser console errors, page errors, and HTTP responses with status 400 or higher. Record the focused smoke-test result and any accepted limitations.

### 3. Promote the identical artifact to ops

After dev acceptance, deploy the same archive bytes to ops. Verify the ops archive checksum against the dev checksum before deployment. Stop if the checksums differ.

Run focused ops smoke tests on the provisioned Relations dashboards. Confirm that the panel loads, queries complete, the main relation families render, and no new browser or server errors appear.

### 4. Complete the OSS gate

The Cloud promotion does not establish the OSS compatibility baseline. After stable Grafana `13.3.0` is published, complete [the stable 13.3 alignment plan](./relations-align-grafana-13-3.plan.md). Align the SDK packages, runtime, lockfile, and Relations manifest before the OSS release.

## Acceptance criteria

- No temporary Grafana 13.2 dependency or runtime upgrade is made for the Cloud rollout.
- One signed and validated standalone artifact is recorded with its source revision and checksum.
- Cloud dev runs Grafana `13.3.0-35049663052` during validation.
- The Cloud dev browser and runtime checks pass, or the release owner accepts recorded limitations.
- The ops artifact checksum is identical to the accepted dev artifact checksum.
- Focused ops smoke tests pass without a rebuild or manifest change.
- Stable Grafana `13.3.0` alignment remains a required gate before the OSS release.

## Rollback

Keep the previously deployed artifact identifier and rollback procedure available before ops promotion. If the ops smoke test fails, stop the rollout, restore the previous artifact, and retain the failed artifact and evidence for diagnosis.

## Evidence

Record the Cloud dev and ops stack identifiers, runtime versions, deployment timestamps, archive checksum, source revision, validation output, smoke-test results, errors, release owner, and promotion approval. The same checksum must appear in both the dev and ops records.
