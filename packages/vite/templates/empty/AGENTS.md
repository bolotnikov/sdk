# Project instructions

- Use public `@gamedevland/engine` subsystem exports; do not deep-import internals.
- Keep flow in FSM → Command → Service. Components/actions own node visuals and input.
- Keep static hierarchies and authored visual values in JSON layouts/prefabs/configs.
- Keep every music/SFX channel and per-asset volume in the audio JSON config.
- Use SDK autoplay recovery and platform-owned data where available.
- Use strict TypeScript; avoid unsafe casts and non-null assertions.
- Run `npm run typecheck`, `npm run lint`, and `npm run build` after changes.
- Do not claim real-browser/device verification from simulated tests.

## Shared game infrastructure, local sources and debugging

- When code could serve multiple games, immediately propose SDK/engine extraction before implementing it. Explain the concrete reuse, smallest public contract and relevant Clean Architecture/design-pattern boundaries. Do not extract, generalize or change shared APIs until Alex approves that scope; an existing explicit approval is sufficient. This qualifies earlier instructions to improve or centralize engine behavior. Reuse existing APIs and continue independent authorized work while approval is pending.
- Keep game-specific rules and debug commands in the game. Use SRP, DIP, explicit dependencies and lifecycle ownership; apply Facade/Adapter/Command only where they solve a demonstrated need, without speculative abstractions.
- Root `art/` (`Art/`) contains raw asset sources; root `references/` (`References/`) contains gameplay/art references. Exclude these directories in the game's root `.gitignore` and runtime manifests. Track prepared runtime assets, licenses and reproducible preparation scripts. Preserve local source files; inspect already tracked files and agree on any removal from Git history separately.
- Before staging, inspect paths and stage only the intended changes; do not sweep new reference/raw files into commits with broad staging commands.
- For SDK games whose installed version supports `@gamedevland/engine/debug`, use the SDK `BrowserGameDebug.attach(engine)` behind `import.meta.env.DEV` and dynamic import to expose `window.GameDebug`. Dispose the binding before engine teardown/HMR. Keep it out of production bundles and verify that exclusion.
- Use `GameDebug` to inspect live engine, current scene/FSM/layout, scene/global DI, pause state and recent errors during relevant browser checks. Resolve current objects on each access; use events/commands/services for gameplay changes. Private `#fields` and function-local variables need DevTools breakpoints.
- Older/local-engine games may lack this API: inspect their actual contracts and propose an upgrade or shared adapter first. Do not claim the global exists or silently migrate unrelated games. No SDK extraction or migration is authorized by these standing rules alone.

## Quiet isolated browser checks

- Run game browser checks in the Codex in-app browser (`iab`), hidden/background by default. Do not activate, navigate or open DevTools in Alex's personal Chrome for routine testing. Use it only if Alex explicitly requests that browser.
- Every test tab must have sound muted before loading the game, using a supported tab/browser output-mute control. Keep it muted across navigation/reload. Hidden tabs and autoplay blocking are not proof of mute. Do not change system volume, personal Chrome settings, saved player audio preferences or production game defaults to silence tests.
- Discover the current browser/tab capabilities. If output mute cannot be set and verified, do not launch a potentially audible check; report the tooling limitation and continue static/silent checks. Do not invent mute APIs or claim muted playback verifies audible quality.
- If the in-app browser cannot access page runtime globals such as `GameDebug`, use supported isolated inspection or report that limit and propose a shared debug bridge before implementing one. Do not switch to personal Chrome as a workaround.
- For SDK games with the approved `BrowserGameTestMode` support, the silent-test alternative is a development-only `configure()` call before `Engine.run` and a `?silentTest=1` launch. Verify `silentTest: true` through the read-only `GameDebugDomBridge` DOM snapshot. This page-lifetime gate covers SDK/Howler audio only; unrelated HTML media/direct Web Audio still requires independently verified muting. Do not enable this query in normal player or production launches.
