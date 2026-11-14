import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, Texture, TextureSource, Ticker } from 'pixi.js';
import { AssetManager } from '../src/assets';
import { JsonLoader } from '../src/assets/loaders/JsonLoader';
import { TextLoader } from '../src/assets/loaders/TextLoader';
import { BinaryLoader } from '../src/assets/loaders/BinaryLoader';
import { RigbySkeletonFactory } from '../src/renderers/pixi/rigby/internal/RigbySkeletonFactory';
import { RigbySkeleton } from '../src/renderers/pixi/rigby/RigbySkeleton';

const skeleton = { skeleton: { spine: '4.3' }, bones: [{ name: 'root' }], slots: [{ name: 'art', bone: 'root', attachment: 'art' }],
  skins: [{ name: 'default', attachments: { art: { art: { width: 32, height: 32 } } } }],
  animations: { swim: { bones: { root: { rotate: [{ time: 0, value: 0 }, { time: 1, value: 20 }] } } } } };
const atlas = 'page.webp\nsize: 32, 32\nfilter: Linear, Linear\nart\nbounds: 0, 0, 32, 32\n';
const config = { type: 'RigbySkeleton', props: { skeleton: 'hero.json', atlas: 'hero.atlas', pages: [{ name: 'page.webp', asset: 'page.webp' }], animation: 'swim' } };
async function assets() {
  const assets = new AssetManager({ retry: { retries: 0 } });
  assets.registerLoader('json', new JsonLoader()); assets.registerLoader('text', new TextLoader());
  assets.registerBundles({ name: 'rig', assets: [
    { id: 'hero.json', type: 'json', importedUrl: 'data:application/json,' + encodeURIComponent(JSON.stringify(skeleton)) },
    { id: 'hero.atlas', type: 'text', importedUrl: 'data:text/plain,' + encodeURIComponent(atlas) },
  ] });
  await assets.loadRequiredBundle('rig');
  return assets;
}

test('SDK drives Rigby once per tick, freezes at zero speed and frees geometry without destroying atlas textures', async () => {
  const store = await assets();
  const texture = new Texture({ source: new TextureSource({ width: 32, height: 32 }) });
  const factory = new RigbySkeletonFactory({ getRequiredTexture: () => texture }).factory();
  const started = Ticker.shared.started;
  const node = factory('hero', config, { assets: store, createChild: () => { throw new Error('leaf node'); } }).object.requireNode(RigbySkeleton);
  assert.equal(Ticker.shared.started, started);
  assert.equal(node.acceptsChildren, false);
  assert.equal(node.meshCount, 1);
  const mesh = node.view.children[0]?.children[0];
  assert(mesh instanceof Mesh);
  const geometry = mesh.geometry;
  const before = Array.from(geometry.getBuffer('aPosition').data);
  node.update(.25);
  assert.equal(node.animationTime, .25);
  assert.notDeepEqual(Array.from(geometry.getBuffer('aPosition').data), before);
  node.setTimeScale(0); node.update(.25); assert.equal(node.animationTime, .25);
  node.setTimeScale(2); node.update(.25); assert.equal(node.animationTime, .75);
  assert.throws(() => node.play('missing'), /Unknown Rigby animation/);
  assert.throws(() => node.setTimeScale(-1));
  node.play('swim'); assert.equal(node.animationTime, 0);
  const positions = geometry.getBuffer('aPosition');
  let disposed = 0; geometry.on('destroy', () => disposed++);
  await node.destroy(); await node.destroy(); node.update(.5);
  assert.equal(positions.destroyed, true);
  assert.equal(disposed, 1); assert.equal(texture.destroyed, false);
  assert.throws(() => node.play('swim'), /destroyed/);
  texture.destroy(true); await store.destroy();
});

test('Rigby creation fails before rendering for missing, duplicate or incorrectly sized atlas pages', async () => {
  const store = await assets();
  const texture = new Texture({ source: new TextureSource({ width: 16, height: 16 }) });
  const factory = new RigbySkeletonFactory({ getRequiredTexture: () => texture }).factory();
  const context = { assets: store, createChild: () => { throw new Error('leaf node'); } };
  assert.throws(() => factory('hero', config, context), /size mismatch/);
  assert.throws(() => factory('hero', { ...config, props: { ...config.props, pages: [] } }, context), /Missing Rigby atlas page/);
  assert.throws(() => factory('hero', { ...config, props: { ...config.props, pages: [...config.props.pages, ...config.props.pages] } }, context), /duplicate/);
  texture.destroy(true); await store.destroy();
});

test('binary and text loaders preserve bytes and honor cancellation', async () => {
  const descriptor = { id: 'data', type: 'binary' as const, url: 'data:application/octet-stream;base64,AAEC/w==' };
  const bytes = await new BinaryLoader().load(descriptor, new AbortController().signal);
  assert.deepEqual([...new Uint8Array(bytes)], [0, 1, 2, 255]);
  const signal = AbortSignal.abort();
  await assert.rejects(new BinaryLoader().load(descriptor, signal), { name: 'AbortError' });
  await assert.rejects(new TextLoader().load({ ...descriptor, type: 'text' }, signal), { name: 'AbortError' });
});

test('play applies a new initial pose while frozen, without advancing time', async () => {
  const store = await assets();
  const texture = new Texture({ source: new TextureSource({ width: 32, height: 32 }) });
  const factory = new RigbySkeletonFactory({ getRequiredTexture: () => texture }).factory();
  const node = factory('hero', config, { assets: store, createChild: () => { throw new Error('leaf'); } }).object.requireNode(RigbySkeleton);
  const mesh = node.view.children[0]?.children[0];
  assert(mesh instanceof Mesh);
  const positions = () => Array.from(mesh.geometry.getBuffer('aPosition').data);
  const setup = positions();
  node.update(.5);
  assert.notDeepEqual(positions(), setup);
  node.setTimeScale(0);
  node.restart();
  assert.deepEqual(positions(), setup);
  assert.equal(node.animationTime, 0);
  node.update(.5);
  assert.deepEqual(positions(), setup);
  assert.equal(node.animationTime, 0);
  node.setTimeScale(1);
  node.update(.25);
  assert.notDeepEqual(positions(), setup);
  assert.throws(() => node.update(NaN));
  assert.throws(() => node.update(-1));
  await node.destroy();
  assert.throws(() => node.setTimeScale(1), /destroyed/);
  texture.destroy(true); await store.destroy();
});

test('restart preserves one-shot playback rather than silently enabling looping', async () => {
  const store = await assets();
  const texture = new Texture({ source: new TextureSource({ width: 32, height: 32 }) });
  const factory = new RigbySkeletonFactory({ getRequiredTexture: () => texture }).factory();
  const node = factory('hero', { ...config, props: { ...config.props, loop: false } }, { assets: store, createChild: () => { throw new Error('leaf'); } }).object.requireNode(RigbySkeleton);
  const mesh = node.view.children[0]?.children[0];
  assert(mesh instanceof Mesh);
  node.update(1);
  const end = Array.from(mesh.geometry.getBuffer('aPosition').data);
  node.restart(); node.update(1.2);
  assert.deepEqual(Array.from(mesh.geometry.getBuffer('aPosition').data), end);
  await node.destroy(); texture.destroy(true); await store.destroy();
});
