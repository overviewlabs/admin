# @whoxos/ui

Published static assets for the WHOXOS board UI.

## What gets published

The npm package contains the production build under `dist/`. It does not ship the UI source tree or workspace-only dependencies.

## Storybook

Storybook config, stories, and fixtures live under `ui/storybook/`.

```sh
pnpm --filter @whoxos/ui storybook
pnpm --filter @whoxos/ui build-storybook
```

## Typical use

Install the package, then serve or copy the built files from `node_modules/@whoxos/ui/dist`.
