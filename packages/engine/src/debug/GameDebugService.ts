import type { Engine } from '../core/Engine';
import type { GameDebugError, GameDebugRuntime } from './types';

/** Live runtime inspection without browser globals or game-specific commands. */
export class GameDebugService<TRuntime extends GameDebugRuntime = Engine> {
  private readonly recentErrors: GameDebugError[] = [];
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(readonly engine: TRuntime) {
    this.unsubscribe = engine.diagnostics.subscribe((record) => {
      if (record.kind !== 'error') return;
      this.recentErrors.push(record);
      if (this.recentErrors.length > 100) this.recentErrors.shift();
    });
  }

  get scene() { return this.engine.scenes.getCurrentScene(); }
  get layout() { return this.engine.getRequiredActiveLayout(); }
  get fsm() { return this.engine.getCurrentSceneFSM(); }
  get di() { return this.engine.getRequiredActiveSceneDi(); }
  get errors(): readonly GameDebugError[] { return [...this.recentErrors]; }

  snapshot() {
    const scene = this.scene;
    return {
      scene: scene?.getLifecycleDebugDetails?.()?.sceneKey ?? scene?.constructor.name ?? null,
      state: this.fsm?.current ?? null,
      paused: this.engine.isPaused(),
      viewport: { ...this.engine.screen.getViewportSize() },
      virtual: { ...this.engine.screen.getVirtualSize() },
      errors: this.errors,
    };
  }

  pause(): void { this.engine.setPaused(true); }
  resume(): void { this.engine.setPaused(false); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.recentErrors.length = 0;
  }
}
