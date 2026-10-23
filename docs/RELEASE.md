# Releasing

Releases are published to npm as `@laskaridis/afk` by GitHub Actions when a `v*` tag is pushed. Do not run `npm publish` locally.

## Setup (already done)

The package has a trusted publisher configured on npmjs.com for GitHub Actions:

- Repository: `laskaridis/afk`
- Workflow filename: `release.yml`
- Allowed actions: `npm publish` (`npm dist-tag` is not needed)

No npm token is stored anywhere. Authentication is OIDC, and provenance is attached automatically.

## Releasing a new version

1. Start from an up-to-date `main`:

   ```
   git checkout main && git pull
   ```

2. Bump the version. This edits `package.json`, commits, and creates the `vX.Y.Z` tag:

   ```
   npm version patch   # or minor / major
   ```

3. Push the commit and tag together:

   ```
   git push --follow-tags origin main
   ```

4. Watch the run and verify:

   ```
   gh run watch
   npm view @laskaridis/afk version
   ```

   The registry can take a few minutes to show the new version after the run succeeds.

## What the workflow does

`.github/workflows/release.yml` runs on Node 22 with npm pinned to 11 (trusted publishing needs npm >= 11.5.1). It installs dependencies, runs typecheck, tests and build, then runs `npm publish`. If any step fails, nothing is published.

## Gotchas

- **Keep npm pinned to 11.** npm 12 changes the output shape of `npm pack --json` (an object instead of an array), which breaks `test/package.test.ts`. Unpin only after that test handles both shapes.
- **Never reuse a tag.** If a release run fails, fix the problem and bump to a new version rather than moving or force-pushing the tag. A failed run publishes nothing, so skipping a version number is harmless.
- **The workflow file must be on the tagged commit.** Changes to `release.yml` need to be on `main` before the tag is created.
- **Choose the bump by what changed since the last tag:** `patch` for fixes, `minor` for new features, `major` for breaking changes.
