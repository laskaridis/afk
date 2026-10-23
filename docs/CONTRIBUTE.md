# Contributing

## Setup

You need Node.js 20 or newer and [pnpm](https://pnpm.io) (the version is pinned in `package.json`). CI runs on Node.js 22.

```sh
pnpm install
```

## Scripts

```sh
pnpm verify         # lint, format check, type-check, and tests (run this before pushing)
pnpm lint           # lint with Biome
pnpm format         # format with Biome (writes changes)
pnpm format:check   # check formatting without writing
pnpm typecheck      # type-check
pnpm test           # run the test suite (vitest)
pnpm coverage       # run the tests with a coverage report
pnpm build          # compile to dist/
```

`pnpm verify` is what CI runs on every push to `main` and on pull requests. CI also runs `pnpm coverage` and posts a coverage report on pull requests.

## Project layout

- `src/` – the CLI source; see [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together
- `test/` – vitest tests, with fixtures and helpers
- `specs/` – specifications and task lists; implemented ones live in `specs/done`
- `docs/` – [architecture](ARCHITECTURE.md), [glossary](GLOSSARY.md), and [release process](RELEASE.md)

## Releasing

See [RELEASE.md](RELEASE.md).
