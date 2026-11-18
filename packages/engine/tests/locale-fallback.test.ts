import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AssetManager } from '../src/assets';
import { ConfigStore, LocaleCatalog, LocaleDictionaryConfigDecoder, LocalesService } from '../src/configs';
import { ConfigBootstrapper } from '../src/core/boot/ConfigBootstrapper';

const english = LocaleCatalog.getConfigId('en');
const russian = LocaleCatalog.getConfigId('ru');
const german = LocaleCatalog.getConfigId('de');

test('an English-only game renders translated text under a Russian platform locale', () => {
  const configs = new ConfigStore();
  configs.set(english, { 'collection.items': '{count} items' });
  const locales = new LocalesService(configs);

  locales.setLang('ru-RU');

  assert.equal(locales.getLang(), 'ru');
  assert.equal(locales.t('collection.items', { count: 2 }), '2 items');
  assert.equal(locales.has('collection.items'), true);
});

test('fallback skips invalid entries and retains valid entries and configured languages', () => {
  const configs = new ConfigStore();
  configs.set(english, JSON.parse('{"greeting":"Hello","count":"{count} items","damaged":42,"__proto__":"An own key"}'));
  configs.set(russian, { greeting: 'Привет', count: '', damaged: [] });
  configs.set(german, { count: '{count} Stück' });
  const locales = new LocalesService(configs, ['de', 'unknown']);
  locales.initialize({ supportedLocales: ['ru', 'de'], defaultLocale: 'ru', preferredLocales: ['ru'] });

  assert.equal(locales.t('greeting'), 'Привет');
  assert.equal(locales.t('count', { count: 2 }), '2 Stück');
  assert.equal(locales.t('damaged'), 'damaged');
  assert.equal(locales.has('damaged'), false);
  assert.equal(locales.has('toString'), false);
  assert.equal(locales.t('__proto__'), 'An own key');
  assert.throws(() => LocaleDictionaryConfigDecoder.decode({ damaged: 42 }, 'strict validation'));

  const englishFallback = new LocalesService(configs, []);
  englishFallback.initialize({ supportedLocales: ['ru'], defaultLocale: 'ru', preferredLocales: ['ru'] });
  assert.equal(englishFallback.t('count', { count: 2 }), '2 items');
});

test('lookup recovers when a dictionary arrives late or replaces malformed data', () => {
  const configs = new ConfigStore();
  const locales = new LocalesService(configs);
  locales.setLang('ru');

  assert.equal(locales.t('label {count}', { count: 2 }), 'label 2');
  assert.equal(locales.has('label {count}'), false);
  configs.set(english, { label: 'English' });
  configs.set(russian, ['malformed']);
  assert.equal(locales.t('label'), 'English');
  configs.set(russian, { label: 'Русский' });
  assert.equal(locales.t('label'), 'Русский');
  configs.set(russian, null);
  assert.equal(locales.t('label'), 'English');
  configs.set(english, null);
  assert.equal(locales.t('label'), 'label');
});

test('an unusable configured default selects English', () => {
  const configs = new ConfigStore();
  configs.set(english, { greeting: 'Hello' });
  const locales = new LocalesService(configs);
  locales.initialize({ supportedLocales: ['ru'], defaultLocale: 'de', preferredLocales: [] });

  assert.equal(locales.getLang(), 'en');
  assert.equal(locales.t('greeting'), 'Hello');
  locales.setLang('unavailable');
  assert.equal(locales.getLang(), 'en');
  locales.initialize({ supportedLocales: [], preferredLocales: ['ru', 'xx'] });
  assert.equal(locales.getLang(), 'en');
});

test('config bootstrap continues after locale loading errors and surfaces required config failures', async () => {
  const settings = 'json/configs/game.json';
  const assets = new AssetManager({ retry: { retries: 0 } });
  assets.registerLoader('json', {
    async load({ id }) {
      if (id === english) return JSON.parse('{"greeting":"Hello"}');
      if (id === russian) return JSON.parse('{malformed');
      throw new Error('Failed to load required settings');
    },
  });
  assets.registerBundles(
    { name: 'locales', assets: [{ id: english, type: 'json', url: 'en' }, { id: russian, type: 'json', url: 'ru' }] },
    { name: 'configs', assets: [{ id: settings, type: 'json', url: 'game' }] },
  );

  const configs = new ConfigStore();
  const bootstrap = new ConfigBootstrapper(assets, configs);
  await bootstrap.bootstrapBundles(['locales']);
  const locales = new LocalesService(configs);
  locales.setLang('ru');
  assert.equal(locales.t('greeting'), 'Hello');
  await assert.rejects(bootstrap.bootstrapBundles(['configs']), /Required asset loading failed/);
  await assert.rejects(bootstrap.bootstrapBundles(['unknown']), /Bundle not found/);
  await new ConfigBootstrapper(new AssetManager(), new ConfigStore()).bootstrapBundles(['locales']);
});
