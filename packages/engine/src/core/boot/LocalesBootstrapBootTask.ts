import { LocaleCatalog } from '@engine/configs/common/LocaleCatalog';

import type { EngineBootTask } from './EngineBootTask';
import type { LocalesService } from '@engine/configs';
import type { PlatformManager } from '@engine/platforms';

export class LocalesBootstrapBootTask implements EngineBootTask {
  constructor(
    private readonly localesService: LocalesService,
    private readonly platformManager: PlatformManager,
  ) {}

  async run(): Promise<void> {
    this.localesService.setLang(this.resolveEffectiveLocale());
  }

  private resolveEffectiveLocale(): string {
    const platformLocale = LocaleCatalog.normalize(this.platformManager.getPreferredLocale());
    if (platformLocale !== null) {
      return platformLocale;
    }
    return LocaleCatalog.coerceSupported(this.readDefaultLocale());
  }

  private readDefaultLocale(): string | undefined {
    const defaultLocale: unknown = import.meta.env.VITE_DEFAULT_LOCALE;
    return typeof defaultLocale === 'string' ? defaultLocale : undefined;
  }
}
