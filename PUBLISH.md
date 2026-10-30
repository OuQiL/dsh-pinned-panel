# Publishing

The bundle ships without a build step, so publishing is one command — but it is a **human step**:
the registry credentials belong to the maintainer, not to the assistant.

## Preflight

```bash
node scripts/verify.mjs     # encoding, JSON, manifest, client module
npm pack --dry-run --json   # inspect the exact tarball contents
```

`prepublishOnly` runs the same verification automatically, so a broken manifest cannot be published.

## Publish

```bash
npm login                                   # once per machine
npm publish --access public                 # runs prepublishOnly first
```

The package name is unscoped (`dsh-pinned-panel`); `publishConfig` is not needed, but if the name is
taken the manifest must switch to a scope and every install line in the READMEs has to follow.

## After publishing

1. Create the matching GitHub release (or push the tag first):
   `git tag vX.Y.Z && git push origin vX.Y.Z`, then `gh release create vX.Y.Z --notes-file …`.
2. Post a one-line update on the market listing issue
   ([polang233/dsh-plugin-index#89](https://github.com/polang233/dsh-plugin-index/issues/89))
   so the index re-reads the new version instead of the pinned commit.
3. Verify the installed bundle in a profile:
   `dsh plugin --profile <name> add dsh-pinned-panel` then reload the page and check the console line
   `[dsh-pinned-panel] active vX.Y.Z`.

## Why the assistant does not publish

`npm login` needs interactive credentials and the publish action is irreversible for a version
number. Everything up to that point (verification, tarball inspection, release notes, tags) is
scripted here.
