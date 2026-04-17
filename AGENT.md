# Agent instructions

Guidance for AI agents (Claude Code, Cursor, etc.) working in this repository. Human contributors are welcome to follow it too.

## Bump the extension version on every change

Whenever you modify any file under `extensions/<name>/` (source, config, README, etc.), update that extension's `package.json` `version` field to:

```
<base-version>+<short-sha>
```

- `<base-version>` is the current `MAJOR.MINOR.PATCH` of that extension. Do **not** change it for routine edits — only bump the base for deliberate releases.
- `<short-sha>` is the current `HEAD` commit at the time of the change. Get it with:

  ```sh
  git rev-parse --short HEAD
  ```

- The `+` is [semver build metadata](https://semver.org/#spec-item-10) — required so the resulting string remains valid semver.
- Apply this **per-extension**: only the extensions whose files you touched need their version bumped. Don't bump untouched extensions.
- Include the version bump in the **same commit** as the extension change (not a follow-up commit). The SHA stored in the version is the parent commit's — i.e., it records the baseline the change was built on.

### Example

Baseline: `extensions/foo/package.json` has `"version": "0.0.0"`, and `git rev-parse --short HEAD` returns `abc1234`.

You edit `extensions/foo/src/Panel.tsx`. In the same commit, set:

```json
"version": "0.0.0+abc1234"
```

### Why

The packaged `.foxe` filename includes the version, so every build artifact is uniquely traceable back to the commit it was built from. This matters for debugging field reports and for future publishing to the [Foxglove extension registry](https://github.com/foxglove/extension-registry).
