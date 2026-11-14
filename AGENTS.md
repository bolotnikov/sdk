# SDK workspace instructions

- Follow package-local AGENTS.md and public package contracts. Keep reusable runtime behavior renderer-neutral and game-independent.
- If a consumer need suggests shared infrastructure, propose the smallest SDK extraction and its Clean Architecture boundaries to Alex before implementing it. Proceed within an already approved SDK scope; standing rules are not blanket approval for future migrations.
- Runtime behavior belongs in classes, one runtime class per file. Export through public subsystem barrels/package exports; preserve strict TypeScript and deterministic cleanup.
- Shared debugging belongs in `@gamedevland/engine/debug`: `GameDebugService` owns inspection and diagnostics, `BrowserGameDebug` owns the browser binding. Game-specific debug commands stay in consumers.
- New game templates must expose `window.GameDebug` only through a development-only dynamic import, dispose its binding before teardown/HMR, and exclude debug code from production.
- Game-root raw `art/`/`Art/` and `references/`/`References/` are local authoring inputs, ignored by Git and runtime manifests. Prepared runtime assets, licenses and preparation scripts remain tracked. Inspect staged paths.
- Run `npm run typecheck`, `npm run lint`, `npm run build`, relevant engine/tooling tests, and `npm run test:project-template` when changing the scaffold or public SDK exports.
- For local consumer validation, package SDK changes into versioned local archives and install those archives. Do not publish npm packages or migrate unrelated games unless requested.
- Preserve unrelated user changes. Report real-browser checks separately from unit/build checks.

## Quiet isolated browser checks

- Run game browser checks in the Codex in-app browser (`iab`), hidden/background by default. Do not activate, navigate or open DevTools in Alex's personal Chrome for routine testing. Use it only if Alex explicitly requests that browser.
- Every test tab must have sound muted before loading the game, using a supported tab/browser output-mute control. Keep it muted across navigation/reload. Hidden tabs and autoplay blocking are not proof of mute. Do not change system volume, personal Chrome settings, saved player audio preferences or production game defaults to silence tests.
- Discover the current browser/tab capabilities. If output mute cannot be set and verified, do not launch a potentially audible check; report the tooling limitation and continue static/silent checks. Do not invent mute APIs or claim muted playback verifies audible quality.
- If the in-app browser cannot access page runtime globals such as `GameDebug`, use supported isolated inspection or report that limit and propose a shared debug bridge before implementing one. Do not switch to personal Chrome as a workaround.
- For SDK games with the approved `BrowserGameTestMode` support, the silent-test alternative is a development-only `configure()` call before `Engine.run` and a `?silentTest=1` launch. Verify `silentTest: true` through the read-only `GameDebugDomBridge` DOM snapshot. This page-lifetime gate covers SDK/Howler audio only; unrelated HTML media/direct Web Audio still requires independently verified muting. Do not enable this query in normal player or production launches.
