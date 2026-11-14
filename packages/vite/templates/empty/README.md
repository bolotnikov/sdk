# __PROJECT_NAME__

A blank TypeScript/PixiJS game using the Gamedev Land SDK. No demo gameplay or media assets.

```sh
npm run dev
npm run typecheck
npm run lint
npm run build
```

The CLI installs dependencies by default. If created with `--no-install`, run `npm install` first.
Node.js 22.12+ is required.

Entry: `game/src/main.ts`. Configuration: `game/src/config/GameConfiguration.ts`.
The empty scene uses the SDK's FSM, scene DI, asset manifest and JSON layout.
Add gameplay through FSM → Command → Service; put visuals in components/actions.

All music/SFX channel and per-file levels belong in
`game/assets/json/configs/audio/sounds-volumes.json`.

## Development debugging and local source files

After startup in `npm run dev`, the SDK exposes `window.GameDebug`. Use
`GameDebug.snapshot()` for scene key, FSM state, pause state, screen sizes and recent
SDK errors. Inspect `GameDebug.engine`, `.scene`, `.layout`, `.fsm`, `.di`, and
`.engine.di` for live objects. `GameDebug.pause()` / `.resume()` use normal engine
pause gates. Required layout/DI queries fail fast when unavailable. Keep game-specific
debug commands in the game and mutate gameplay through events, commands or services.
Private `#fields` and function-local variables require DevTools breakpoints.
Startup failures before attachment appear in the browser console.

The development-only dynamic import excludes debug code from production output.
Dispose the binding before explicit engine teardown; the entry point handles HMR cleanup.
See the SDK `/debug` documentation before changing this wiring.

For isolated quiet tests, open the dev server with `?silentTest=1`. The template
configures the SDK output gate before startup and exposes a hidden read-only
`#game-debug[data-state]` snapshot, including `silentTest: true`. This only silences
SDK/Howler output, not unrelated HTML media or direct Web Audio. Normal/production
launches retain the player's regular audio behavior.

Root `art/` (`Art/`) is for raw asset sources and `references/` (`References/`) for
gameplay/art references. Both stay local, ignored by Git and outside runtime manifests.
Track prepared runtime assets, licenses and reproducible preparation scripts.

When a game feature reveals reusable cross-game infrastructure, propose the smallest
SDK extraction and ownership boundaries to Alex before implementing the shared change.
Reuse existing APIs while awaiting approval; keep feature rules in the game.

`npm run dev:crazygames` enables the official CrazyGames v3 SDK on localhost.
`npm run build:crazygames` produces `dist/crazygames/` with relative asset paths.
Report gameplay start/stop when actual gameplay is added; a blank scene is not gameplay.
