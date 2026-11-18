import { LocaleCatalog } from '../common/LocaleCatalog';
import { LocaleDictionaryConfigDecoder } from '../common/LocaleDictionaryConfigDecoder';
import { LocalStorageAdapter } from './LocalStorageAdapter';

import type { SupportedLocaleCode } from '../common/LocaleCatalog';
import type { LocaleDictionary } from '../common/Locales';
import type { IStorageAdapter } from '../types';
import type { ConfigStore } from '../core/ConfigStore';

export interface LocalePreferences {
  readonly supportedLocales: readonly SupportedLocaleCode[];
  readonly defaultLocale?: SupportedLocaleCode;
  readonly deviceLocale?: string | null;
  readonly preferredLocales?: readonly string[];
  readonly storage?: IStorageAdapter;
  readonly storageKey?: string;
}

/** Dictionary lookup and persistent, observable language preferences. */
export class LocalesService {
  private current: SupportedLocaleCode = LocaleCatalog.DEFAULT;
  private supported: readonly SupportedLocaleCode[] = [LocaleCatalog.EN, LocaleCatalog.RU];
  private defaultLocale: SupportedLocaleCode = LocaleCatalog.DEFAULT;
  private storage: IStorageAdapter | undefined;
  private storageKey: string | undefined;
  private revision = 0;
  private readonly listeners = new Set<(locale: SupportedLocaleCode) => void>();
  private readonly fallback: readonly SupportedLocaleCode[];
  private readonly loadedDictionaries = new Map<SupportedLocaleCode, { raw: unknown; dictionary: LocaleDictionary }>();

  constructor(
    private readonly configStore: ConfigStore,
    fallback: readonly string[] = [LocaleCatalog.DEFAULT],
  ) {
    this.fallback = (Array.isArray(fallback) ? fallback : [])
      .map((lang) => LocaleCatalog.normalize(lang))
      .filter((lang): lang is SupportedLocaleCode => lang !== null);
  }

  initialize(options: LocalePreferences): void {
    const configured = Array.isArray(options.supportedLocales) ? options.supportedLocales : [];
    const supported = configured.map((locale) => LocaleCatalog.normalize(locale))
      .filter((locale): locale is SupportedLocaleCode => locale !== null);
    this.supported = [...new Set<SupportedLocaleCode>([...supported, LocaleCatalog.DEFAULT])];
    const fallback = LocaleCatalog.coerceSupported(options.defaultLocale);
    this.defaultLocale = this.supported.includes(fallback) ? fallback : LocaleCatalog.DEFAULT;
    this.storageKey = options.storageKey;
    this.storage = options.storage;
    if (this.storageKey && !this.storage) {
      try { this.storage = new LocalStorageAdapter(); } catch { this.storage = undefined; }
    }
    let saved: string | null = null;
    if (this.storage && this.storageKey) {
      try { saved = this.storage.getItem(this.storageKey); } catch { this.storage = undefined; }
    }
    const browser = typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language];
    const preferred = Array.isArray(options.preferredLocales) ? options.preferredLocales : browser;
    const candidates = [saved, options.deviceLocale, ...preferred];
    const selected = candidates.map((value) => LocaleCatalog.normalize(value))
      .find((locale) => locale !== null && this.supported.includes(locale));
    this.apply(selected ?? this.defaultLocale);
  }

  setLang(lang: string): void {
    const normalized = LocaleCatalog.normalize(lang);
    const selected = normalized !== null && this.supported.includes(normalized) ? normalized : this.defaultLocale;
    if (this.storage && this.storageKey) {
      try { this.storage.setItem(this.storageKey, selected); } catch { this.storage = undefined; }
    }
    this.apply(selected);
  }

  getRevision(): number { return this.revision; }

  subscribe(listener: (locale: SupportedLocaleCode) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private apply(locale: SupportedLocaleCode): void {
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
    if (locale === this.current) return;
    this.current = locale;
    this.revision++;
    for (const listener of this.listeners) listener(locale);
  }

  getLang(): SupportedLocaleCode {
    return this.current;
  }

  t(key: string, params?: Readonly<Record<string, string | number>>): string {
    return this.interpolate(this.findTranslation(key) ?? key, params);
  }

  has(key: string): boolean {
    return this.findTranslation(key) !== undefined;
  }

  private findTranslation(key: string): string | undefined {
    for (const locale of this.getLookupOrder()) {
      const dictionary = this.loadDictionary(locale);
      if (Object.hasOwn(dictionary, key)) return dictionary[key];
    }
    return undefined;
  }

  private loadDictionary(locale: SupportedLocaleCode): LocaleDictionary {
    const configId = LocaleCatalog.getConfigId(locale);
    const raw = this.configStore.get(configId);
    const cached = this.loadedDictionaries.get(locale);
    if (cached && cached.raw === raw) return cached.dictionary;

    const dictionary = LocaleDictionaryConfigDecoder.decodeAvailable(raw, `LocalesService('${configId}')`);
    this.loadedDictionaries.set(locale, { raw, dictionary });
    return dictionary;
  }

  private getLookupOrder(): ReadonlySet<SupportedLocaleCode> {
    const fallback = this.fallback.filter((locale) => locale !== LocaleCatalog.DEFAULT && this.supported.includes(locale));
    return new Set([this.current, ...fallback, this.defaultLocale, LocaleCatalog.DEFAULT]);
  }

  private interpolate(template: string, params?: Readonly<Record<string, string | number>>): string {
    if (!params) {
      return template;
    }
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, token: string) => {
      const value = params[token];
      return value === undefined ? match : String(value);
    });
  }
}
