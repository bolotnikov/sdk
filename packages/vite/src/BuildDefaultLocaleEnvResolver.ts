import { LocaleCatalog } from '@gamedevland/engine/configs';
import { loadEnv } from 'vite';

/**
 * Resolves and normalizes the build-time default locale.
 */
export class BuildDefaultLocaleEnvResolver {
  static resolve(mode: string, cwd: string): string {
    const env = loadEnv(mode, cwd, '');
    const rawLocale = process.env.VITE_DEFAULT_LOCALE ?? env.VITE_DEFAULT_LOCALE;
    return LocaleCatalog.coerceSupported(rawLocale);
  }
}
