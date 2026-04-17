# foxglove-extensions

A personal collection of [Foxglove Studio](https://foxglove.dev/) extensions, organized as an npm workspaces monorepo.

Each extension is a self-contained package under `extensions/` built with the [`@foxglove/extension`](https://www.npmjs.com/package/@foxglove/extension) SDK and scaffolded via the official [`create-foxglove-extension`](https://github.com/foxglove/create-foxglove-extension) generator.

## Layout

```
foxglove-extensions/
├── package.json              # workspaces root
└── extensions/
    ├── example-panel/        # scaffolding reference
    └── form-publish-panel/   # form-driven JSON publisher
```

## Requirements

- Node.js 24+ (see `.nvmrc`)
- Foxglove Studio desktop (for `local-install` verification)

## Getting started

```sh
npm install
```

## Adding a new extension

```sh
cd extensions
npm init foxglove-extension@latest <extension-name>
cd ..
npm install
```

The root `npm install` re-links workspaces so the new extension is picked up. Then add the new workspace name to the CI fan-out matrix in `.circleci/config.yml` (`workflows.all.jobs.build-ext.matrix.parameters.ext`) so the new extension is linted, built, and tested on every push.

## Dev loop

Run from the repo root to fan out across every extension, or from a single extension's directory to target just that one.

| Command | What it does |
| --- | --- |
| `npm run build` | Compile each extension's `dist/extension.js`. |
| `npm run local-install` | Build and copy each extension to `~/.foxglove-studio/extensions/`. Restart Foxglove Studio to see changes. |
| `npm run package` | Produce a distributable `.foxe` per extension. |
| `npm run lint` / `npm run lint:fix` | Lint across all extensions. |
| `npm run clean` | Remove each extension's build output. |

## Continuous integration

CircleCI config lives in `.circleci/config.yml`. Two workflows:

- **`all`** — the default. Runs on every push and fans out a parallel job per extension (lint + build + test + package). The fan-out uses a matrix listing extension workspace names. When you add a new extension, append its workspace name to the matrix under `workflows.all.jobs.build-ext.matrix.parameters.ext` in `.circleci/config.yml`.
- **`one`** — runs only when the pipeline is triggered with an `extension` parameter, scoping the same checks to a single workspace.

Each job produces the extension's `.foxe` package and uploads it as a CircleCI artifact under the `foxe/` prefix. These artifacts are the files you would submit to the [Foxglove extension registry](https://github.com/foxglove/extension-registry) — download them from the pipeline's **Artifacts** tab.

### Trigger a single-extension run

Via the CircleCI UI: click **Trigger Pipeline** and set parameter `extension` to the workspace name (e.g., `example-panel`).

Via the API:

```sh
curl -X POST https://circleci.com/api/v2/project/gh/<org>/<repo>/pipeline \
  -H "Circle-Token: $CIRCLE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parameters": {"extension": "example-panel"}}'
```

Locally, scope any root script to one workspace with npm's `--workspace` flag:

```sh
npm --workspace example-panel run build
npm --workspace example-panel run lint
```
