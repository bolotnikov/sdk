import { EngineError, EngineErrorCode } from '@engine/errors';

import type { EngineBootConfigPlan } from './EngineBootConfigPlan';
import type { AssetManager } from '@engine/assets';
import type { ConfigStore } from '@engine/configs';

export class ConfigBootstrapper {
  constructor(
    private readonly assets: AssetManager,
    private readonly configStore: ConfigStore,
  ) {}

  async bootstrapEngineStart(plan: EngineBootConfigPlan): Promise<void> {
    await this.bootstrapBundles(plan.getEngineStartBundleNames());
  }

  async bootstrapSceneEnter(plan: EngineBootConfigPlan, sceneKey: string): Promise<void> {
    await this.bootstrapBundles(plan.getSceneEnterBundleNames(sceneKey));
  }

  async bootstrapBundles(bundleNames: readonly string[]): Promise<void> {
    for (const bundleName of bundleNames) {
      const ids = this.getConfigIds(bundleName);
      if (ids === undefined) continue;
      await this.assets.loadBundle(bundleName);
      for (const id of ids) {
        if (this.configStore.has(id)) {
          continue;
        }
        // The bundle preload already attempted each asset. A missing locale can fall back at lookup time.
        const raw = id.startsWith('json/locales/') ? this.assets.get(id) : await this.assets.getJson(id);
        if (raw !== undefined) this.configStore.set(id, raw);
      }
    }
  }

  private getConfigIds(bundleName: string): readonly string[] | undefined {
    try {
      return this.assets.getBundleAssetIds(bundleName, 'json');
    } catch (error) {
      if (bundleName === 'locales' && error instanceof EngineError && error.code === EngineErrorCode.AssetMissingRequired) {
        return undefined;
      }
      throw error;
    }
  }
}
