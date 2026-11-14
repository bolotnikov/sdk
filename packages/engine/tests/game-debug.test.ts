import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserGameDebug, GameDebugService } from '../src/debug';
import type { GameDebugRuntime, GameDebugTarget } from '../src/debug';
import { RuntimeDiagnostics } from '../src/diagnostics/RuntimeDiagnostics';
import { DiContainer } from '../src/di/DiContainer';
import type { Scene } from '../src/scenes/SceneManager';

class DebugRuntime implements GameDebugRuntime {
  readonly diagnostics = new RuntimeDiagnostics();
  readonly sceneDi = new DiContainer();
  currentScene: Scene | null = null;
  readonly scenes = { getCurrentScene: () => this.currentScene };
  readonly viewport = { width: 960, height: 540 };
  readonly screen = {
    getViewportSize: () => this.viewport,
    getVirtualSize: () => ({ width: 960, height: 540 }),
  };
  private paused = false;
  getRequiredActiveLayout(): never { throw new Error('No active layout'); }
  getCurrentSceneFSM() { return undefined; }
  getRequiredActiveSceneDi() { return this.sceneDi; }
  isPaused(): boolean { return this.paused; }
  setPaused(paused: boolean): void { this.paused = paused; }
}

test('debug resolves the current scene and DI on demand and uses runtime pause gates', () => {
  const runtime = new DebugRuntime();
  const debug = new GameDebugService(runtime);
  assert.equal(debug.snapshot().scene, null);
  const scene: Scene = {
    onEnter() {}, onExit() {},
    getLifecycleDebugDetails: () => ({ sceneKey: 'main' }),
  };
  runtime.currentScene = scene;
  assert.equal(debug.scene, scene);
  assert.equal(debug.snapshot().scene, 'main');
  runtime.currentScene = { ...scene, getLifecycleDebugDetails: () => ({ sceneKey: 'next' }) };
  assert.equal(debug.snapshot().scene, 'next');
  runtime.sceneDi.register({ token: 'score', useValue: 42 });
  assert.equal(debug.di.get('score'), 42);
  assert.throws(() => debug.layout, /No active layout/);
  const snapshot = debug.snapshot();
  runtime.viewport.width = 540;
  assert.equal(snapshot.viewport.width, 960, 'Snapshots must not retain mutable screen objects');
  debug.pause();
  assert.equal(runtime.isPaused(), true);
  debug.resume();
  assert.equal(runtime.isPaused(), false);
  debug.dispose();
  debug.dispose();
  assert.equal(runtime.diagnostics.observed, false);
});

test('debug retains only the latest 100 errors and releases its observer', t => {
  t.mock.method(console, 'error', () => {});
  const runtime = new DebugRuntime();
  const debug = new GameDebugService(runtime);
  runtime.diagnostics.report({ kind: 'frame', rawDelta: 1, simulationDelta: 1 });
  runtime.diagnostics.report({ kind: 'timing', source: 'tick', durationMs: 1 });
  for (let i = 0; i < 105; i++) {
    runtime.diagnostics.report({ kind: 'error', source: String(i), error: new Error(String(i)) });
  }
  assert.equal(debug.errors.length, 100);
  assert.equal(debug.errors[0]?.source, '5');
  assert.equal(debug.errors[99]?.source, '104');
  const copy = debug.errors;
  debug.dispose();
  runtime.diagnostics.report({ kind: 'error', source: 'late', error: new Error('late') });
  assert.equal(debug.errors.length, 0);
  assert.equal(copy.length, 100);
  assert.equal(runtime.diagnostics.observed, false);
});

test('browser binding rejects collisions and removes only the global it owns', () => {
  const runtime = new DebugRuntime();
  const target: GameDebugTarget<DebugRuntime> = {};
  const binding = new BrowserGameDebug(runtime, target);
  assert.equal(target.GameDebug?.engine, runtime);
  assert.throws(() => new BrowserGameDebug(runtime, target), /already attached/);
  const replacement = new GameDebugService(runtime);
  target.GameDebug = replacement;
  binding.dispose();
  binding.dispose();
  assert.equal(target.GameDebug, replacement);
  replacement.dispose();
  delete target.GameDebug;
  const next = new BrowserGameDebug(runtime, target);
  next.dispose();
  assert.equal(target.GameDebug, undefined);
  assert.equal(runtime.diagnostics.observed, false);
});
