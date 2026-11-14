import { Engine } from '@gamedevland/engine';
import { GameConfiguration } from './config/GameConfiguration';

if (import.meta.env.DEV) {
  const { BrowserGameTestMode } = await import('@gamedevland/engine/debug');
  BrowserGameTestMode.configure();
}

const engine = await Engine.run('#app', GameConfiguration.config);

if (import.meta.env.DEV) {
  const { BrowserGameDebug, BrowserGameTestMode, GameDebugDomBridge } = await import('@gamedevland/engine/debug');
  const debug = BrowserGameDebug.attach(engine);
  const bridge = new GameDebugDomBridge(debug.debug, () => ({ ...debug.debug.snapshot(), silentTest: BrowserGameTestMode.silent }));
  import.meta.hot?.dispose(async () => {
    bridge.dispose();
    debug.dispose();
    await engine.destroy();
  });
}
