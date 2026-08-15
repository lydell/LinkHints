# Copilot instructions (LinkHints)

## Big picture
- This is a WebExtension built from TypeScript (+ some Preact UIs). Source lives in `src/`.
- Rollup builds everything into `compiled/` (Sucrase strips TS/JSX). `tsc` is used for type-checking only.
- Build/entrypoint mapping is centralized in `project.config.ts` and consumed by `rollup.config.js`.

## Key modules
- `src/background/`: the "hub" (state machine + orchestration). See `src/background/Program.ts`.
- `src/worker/`: content script loaded in every frame; captures keypresses and finds/report elements.
- `src/renderer/`: top-frame content script; renders hints/underlines (shadow DOM container).
- `src/options/` and `src/popup/`: Preact UIs.
- `src/shared/`: shared types/helpers; message schema in `src/shared/messages.ts`.
- `docs/` → `compiled-docs/`: website sources.
- `tests/`: automated e2e tests using Playwright; configured via `playwright.config.ts`.

## Program + messaging model (core convention)
- Each subsystem has a `Program` class in `src/*/Program.ts(x)` and a tiny bootstrap in `src/*/main.ts(x)`.
- Subsystems communicate via `browser.runtime` messages; **background is the router**.
- Message types are discriminated unions in `src/shared/messages.ts` (`ToBackground`, `FromBackground`, plus nested `ToWorker`, `FromWorker`, etc.).
- Each `Program` typically defines a local `wrapMessage(...)` helper to wrap its inner message into `ToBackground`.

## Shared utilities you should use
- Listener lifecycle + error logging: `addListener`, `addEventListener`, and `Resets` in `src/shared/main.ts`.
- Logging: `log(...)` in `src/shared/main.ts` (programs update `log.level` via StateSync).
- Build-time globals are injected by Rollup and typed in `@types/globals.d.ts` (`BROWSER`, `PROD`, `META_*`, `COLOR_*`, `DEFAULT_*`). Don’t try to “import config” for these.

## Generated outputs (don’t edit)
- Do not edit `compiled/`, `compiled-docs/`, or `dist-*`.
- Template generators called by Rollup:
  - `src/manifest.ts` → `compiled/manifest.json`
  - `src/html.tsx` → minimal HTML shells in `compiled/`
  - `src/icons.tsx` (+ `src/icons/`) → icons; update PNGs via `npm run png-icons`
  - `src/css.ts` → injects colors from `project.config.ts` into CSS

## Developer workflows (exact commands)
- Install: `npm ci`
- Type-check/lint/format check/build: `npm test`
- Run e2e tests: `npm run test:playwright`
- Build once (writes `compiled/`): `npm run compile`
- Watch build: `npm run watch`
- Run extension (auto-reloads on `compiled/` changes): `npm run firefox` / `npm run chrome`
- Shortcut to run watch + both browsers: `npm start`

## Change guidance (repo-specific)
- If you add/change a cross-component action, update `src/shared/messages.ts` and both sender/receiver `Program.ts` switch handling.
- Keep message payloads JSON-serializable; prefer discriminated unions over ad-hoc objects.
- When changing extension behavior, update or add tests in `tests/` to verify the changes.
