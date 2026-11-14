import type { Engine } from '../core/Engine';
import { GameDebugService } from './GameDebugService';
import type { GameDebugRuntime, GameDebugTarget } from './types';

declare global {
  interface Window extends GameDebugTarget {}
}

/** Owns the optional browser binding; import and construct only in development. */
export class BrowserGameDebug<TRuntime extends GameDebugRuntime = Engine> {
  private static readonly bindings = new WeakMap<GameDebugTarget, BrowserGameDebug>();
  readonly debug: GameDebugService<TRuntime>;
  private disposed = false;
  private releaseBinding: (() => void) | undefined;

  static attach(engine: Engine, target: GameDebugTarget = window): BrowserGameDebug {
    const current = this.bindings.get(target);
    if (current?.debug.engine === engine && target.GameDebug === current.debug) return current;
    if (current && target.GameDebug !== current.debug) current.dispose();
    const binding = new BrowserGameDebug(engine, target);
    this.bindings.set(target, binding);
    binding.releaseBinding = () => {
      if (this.bindings.get(target) === binding) this.bindings.delete(target);
    };
    return binding;
  }

  constructor(engine: TRuntime, private readonly target: GameDebugTarget<TRuntime>) {
    if (target.GameDebug !== undefined) throw new Error('window.GameDebug is already attached');
    this.debug = new GameDebugService(engine);
    target.GameDebug = this.debug;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.debug.dispose();
    if (this.target.GameDebug === this.debug) delete this.target.GameDebug;
    this.releaseBinding?.();
    this.releaseBinding = undefined;
  }
}
