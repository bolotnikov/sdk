import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetManager } from '../src/assets';
import { TextureAssetResolver } from '../src/layouts/assets/TextureAssetResolver';
import { RigbySkeletonFactory } from '../src/renderers/pixi/rigby/internal/RigbySkeletonFactory';
import { RigbySkeleton } from '../src/renderers/pixi/rigby/RigbySkeleton';

class Bitmap {
  width = 32; height = 32; closes = 0;
  close(): void { this.closes++; }
}

const skeleton = { skeleton: { spine: '4.3' }, bones: [{ name: 'root' }], slots: [{ name: 'art', bone: 'root', attachment: 'art' }], skins: [{ name: 'default', attachments: { art: { art: { width: 32, height: 32 } } } }], animations: { swim: {} } };
const page = (filter: string, pma: boolean) => `page.webp\nsize: 32, 32\nfilter: ${filter}, ${filter}\npma: ${pma}\nart\nbounds: 0, 0, 32, 32\n`;

test('sampling variants are cached without changing existing rigs or default sprites; assets alone close decoded images', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'ImageBitmap');
  Object.defineProperty(globalThis, 'ImageBitmap', { value: Bitmap, configurable: true });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'ImageBitmap', previous); else Reflect.deleteProperty(globalThis, 'ImageBitmap'); });
  const bitmap = new Bitmap();
  const store = new AssetManager();
  store.registerLoader('image', { async load() { return bitmap; }, dispose(resource) { if (resource instanceof Bitmap) resource.close(); } });
  store.registerLoader('json', { async load() { return skeleton; } });
  store.registerLoader('text', { async load(descriptor) { return descriptor.id === 'linear.atlas' ? page('Linear', false) : page('Nearest', false); } });
  store.registerBundles({ name: 'test', assets: [
    { id: 'page.webp', type: 'image', url: '/page.webp' },
    { id: 'rig.json', type: 'json', url: '/rig.json' },
    { id: 'linear.atlas', type: 'text', url: '/linear.atlas' },
    { id: 'nearest.atlas', type: 'text', url: '/nearest.atlas' },
  ] });
  await store.loadRequiredBundle('test');
  const resolver = new TextureAssetResolver(store);
  const plain = resolver.getRequiredTexture('page.webp');
  const originalMode = plain.source.scaleMode, originalAlpha = plain.source.alphaMode;
  const factory = new RigbySkeletonFactory(resolver).factory();
  const context = { assets: store, createChild: () => { throw new Error('leaf'); } };
  const create = (atlas: string) => factory('hero', { type: 'RigbySkeleton', props: { skeleton: 'rig.json', atlas, pages: [{ name: 'page.webp', asset: 'page.webp' }], animation: 'swim' } }, context).object.requireNode(RigbySkeleton);
  const first = create('linear.atlas');
  const linear = resolver.getRequiredTexture('page.webp', { scaleMode: 'linear', alphaMode: 'premultiply-alpha-on-upload' });
  const second = create('nearest.atlas');
  const nearest = resolver.getRequiredTexture('page.webp', { scaleMode: 'nearest', alphaMode: 'premultiply-alpha-on-upload' });
  assert.notEqual(linear.source, nearest.source);
  assert.notEqual(linear.source, plain.source);
  assert.equal(linear.source.scaleMode, 'linear');
  assert.equal(linear.source.alphaMode, 'premultiply-alpha-on-upload');
  assert.equal(nearest.source.scaleMode, 'nearest');
  assert.equal(nearest.source.alphaMode, 'premultiply-alpha-on-upload');
  assert.equal(plain.source.scaleMode, originalMode); assert.equal(plain.source.alphaMode, originalAlpha);
  assert.equal(resolver.getRequiredTexture('page.webp', { scaleMode: 'nearest', alphaMode: 'premultiply-alpha-on-upload' }), nearest);
  await first.destroy(); await second.destroy();
  assert.equal(linear.destroyed, false); assert.equal(nearest.destroyed, false);
  resolver.destroy(); resolver.destroy();
  assert.equal(linear.destroyed, true); assert.equal(nearest.destroyed, true); assert.equal(plain.destroyed, true);
  assert.equal(bitmap.closes, 0, 'GPU teardown must not close asset-owned bitmaps');
  assert.throws(() => resolver.getRequiredTexture('page.webp'), /disposed/);
  await store.destroy(); assert.equal(bitmap.closes, 1);
});

test('texture resolution rejects unloaded or incorrectly typed assets', async () => {
  const assets = new AssetManager();
  const resolver = new TextureAssetResolver(assets);
  assert.throws(() => resolver.getRequiredTexture('missing'), /not loaded/);
  assets.registerLoader('json', { async load() { return {}; } });
  assets.registerBundles({ name: 'bad', assets: [{ id: 'bad', type: 'json', url: '/bad' }] });
  await assets.loadRequiredBundle('bad');
  assert.throws(() => resolver.getRequiredTexture('bad'), /decoded image/);
  resolver.destroy(); await assets.destroy();
});
