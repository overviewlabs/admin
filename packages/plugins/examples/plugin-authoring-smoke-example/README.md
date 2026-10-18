# Plugin Authoring Smoke Example

A WHOXOS plugin

## Development

```bash
pnpm install
pnpm dev            # watch builds
pnpm dev:ui         # local dev server with hot-reload events
pnpm test
```

## Install Into WHOXOS

```bash
npx whoxos plugin install ./
```

## Build Options

- `pnpm build` uses esbuild presets from `@whoxos/plugin-sdk/bundlers`.
- `pnpm build:rollup` uses rollup presets from the same SDK.
