import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Mesh, Texture, TextureSource } from 'pixi.js';
import { RigbyRuntime } from '../src/renderers/pixi/rigby/internal/RigbyRuntime';
import { RigbySkeleton } from '../src/renderers/pixi/rigby/RigbySkeleton';

const skeleton = { skeleton: { spine: '4.3' }, bones: [{ name: 'root' }], slots: [{ name: 'art', bone: 'root', attachment: 'art' }],
  skins: [{ name: 'default', attachments: { art: { art: { width: 32, height: 32 } } } }],
  animations: { swim: { bones: { root: { rotate: [{ time: 0, value: 0 }, { time: 1, value: 20 }] } } } } };
const atlas = 'page.webp\nsize: 32, 32\nfilter: Linear, Linear\nart\nbounds: 0, 0, 32, 32\n';
const noTexture = () => { throw new Error('Texture resolution must follow successful validation'); };

test('missing regions fail before resource resolution, including hidden skins and sequence frames', () => {
  const runtime = new RigbyRuntime();
  assert.throws(() => runtime.create(skeleton, atlas.replace('\nart\n', '\nother\n'), noTexture, 'swim', true), /Missing Rigby atlas region: art/);
  const hidden = { ...skeleton, skins: [...skeleton.skins, { name: 'hidden', attachments: { art: { hidden: { path: 'missing', width: 32, height: 32 } } } }] };
  assert.throws(() => runtime.create(hidden, atlas, noTexture, 'swim', true), /Missing Rigby atlas region: missing/);
  const sequence = { ...skeleton, skins: [{ name: 'default', attachments: { art: { art: { path: 'frame', width: 32, height: 32, sequence: { count: 2, start: 1, digits: 2 } } } } }] };
  assert.throws(() => runtime.create(sequence, atlas.replace('\nart\n', '\nframe01\n'), noTexture, 'swim', true), /Missing Rigby atlas region: frame02/);
  assert.throws(() => runtime.create(skeleton, atlas, noTexture, 'unknown', true), /Unknown Rigby animation/);
});

test('ambiguous regions, malformed bounds and unsupported atlas repetition fail before resource resolution', () => {
  const runtime = new RigbyRuntime();
  assert.throws(() => runtime.create(skeleton, atlas + 'art\nbounds: 0, 0, 32, 32\n', noTexture, 'swim', true), /Duplicate Rigby atlas region/);
  assert.throws(() => runtime.create(skeleton, atlas.replace('bounds: 0, 0, 32, 32', 'bounds: 1, 0, 32, 32'), noTexture, 'swim', true), /exceeds page bounds/);
  assert.throws(() => runtime.create(skeleton, atlas.replace('size: 32, 32', 'size: NaN, 32'), noTexture, 'swim', true), /finite number/);
  assert.throws(() => runtime.create(skeleton, atlas.replace('filter:', 'repeat: xy\nfilter:'), noTexture, 'swim', true), /none/);
  assert.throws(() => runtime.create(skeleton, atlas.replace('filter:', 'pma: true\nfilter:'), noTexture, 'swim', true), /straight alpha/);
});

test('native binary weighted meshes animate with independent poses and keep shared textures alive', async () => {
  const bytes = Uint8Array.from(await readFile(new URL('./fixtures/rigby-triangle.skel', import.meta.url))).buffer;
  const texture = new Texture({ source: new TextureSource({ width: 32, height: 32 }) });
  const runtime = new RigbyRuntime();
  const first = new RigbySkeleton(runtime.create(bytes, atlas, () => texture, 'swim', true), 'swim');
  const second = new RigbySkeleton(runtime.create(bytes, atlas, () => texture, 'swim', true), 'swim');
  const a = first.view.children[0]?.children[0], b = second.view.children[0]?.children[0];
  assert(a instanceof Mesh); assert(b instanceof Mesh);
  assert.notEqual(a.geometry, b.geometry);
  const before = Array.from(b.geometry.getBuffer('aPosition').data);
  first.update(.5);
  assert.notDeepEqual(Array.from(a.geometry.getBuffer('aPosition').data), before);
  assert.deepEqual(Array.from(b.geometry.getBuffer('aPosition').data), before);
  await first.destroy();
  assert.equal(texture.destroyed, false);
  second.update(.25);
  assert.equal(second.meshCount, 1);
  await second.destroy(); texture.destroy(true);
});

test('quarter-turn packed regions and complete numbered sequences are accepted', async () => {
  const texture = new Texture({ source: new TextureSource({ width: 32, height: 32 }) });
  const runtime = new RigbyRuntime();
  const rotated = atlas.replace('bounds: 0, 0, 32, 32', 'bounds: 0, 0, 32, 16\nrotate: 90');
  const first = new RigbySkeleton(runtime.create(skeleton, rotated, () => texture, 'swim', true), 'swim');
  const sequence = { ...skeleton, skins: [{ name: 'default', attachments: { art: { art: { path: 'frame', width: 32, height: 32, sequence: { count: 2, start: 1, digits: 2 } } } } }] };
  const frames = atlas.replace('\nart\n', '\nframe01\n') + 'frame02\nbounds: 0, 0, 32, 32\n';
  const second = new RigbySkeleton(runtime.create(sequence, frames, () => texture, 'swim', true), 'swim');
  assert.equal(first.meshCount, 1); assert.equal(second.meshCount, 1);
  await first.destroy(); await second.destroy(); texture.destroy(true);
});
