import type { Engine } from '../core/Engine';
import type { RuntimeDiagnostics } from '../diagnostics/RuntimeDiagnostics';
import type { RuntimeDiagnostic } from '../diagnostics/types';
import type { SceneManager } from '../scenes/SceneManager';
import type { ScreenManager } from '../screen/ScreenManager';
import type { GameDebugService } from './GameDebugService';

/** Minimal runtime contract needed for inspection; the service preserves the concrete engine type. */
export interface GameDebugRuntime extends Pick<Engine,
  'getRequiredActiveLayout' | 'getCurrentSceneFSM' | 'getRequiredActiveSceneDi' | 'isPaused' | 'setPaused'> {
  readonly diagnostics: Pick<RuntimeDiagnostics, 'subscribe'>;
  readonly scenes: Pick<SceneManager, 'getCurrentScene'>;
  readonly screen: Pick<ScreenManager, 'getViewportSize' | 'getVirtualSize'>;
}

export type GameDebugError = Extract<RuntimeDiagnostic, { kind: 'error' }>;

/** Structural target for the browser binding, also usable without a DOM in tests. */
export interface GameDebugTarget<TRuntime extends GameDebugRuntime = Engine> {
  GameDebug?: GameDebugService<TRuntime>;
}
