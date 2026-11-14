import { ImageSource, Texture } from 'pixi.js';
import { SchemaDecoder as S } from '../../validation';
import type { InferDecoded } from '../../validation';
import type { AssetManager } from '@engine/assets';

const samplingDecoder = S.strictObject({
  scaleMode: S.enumOf(['linear', 'nearest'] as const),
  alphaMode: S.enumOf(['no-premultiply-alpha', 'premultiplied-alpha', 'premultiply-alpha-on-upload'] as const),
});
export type TextureSampling = InferDecoded<typeof samplingDecoder>;

/** Owns GPU textures. Explicit sampling variants never mutate the default/shared source. */
export class TextureAssetResolver {
  private cache = new WeakMap<object, Map<string, Texture>>();
  private readonly textures = new Set<Texture>();
  private disposed = false;

  constructor(private readonly assets: AssetManager) {}

  getRequiredTexture(assetId: string, sampling?: TextureSampling): Texture {
    if (this.disposed) throw new Error('TextureAssetResolver is disposed');
    const options = sampling === undefined ? undefined : S.decode(sampling, samplingDecoder, 'TextureAssetResolver.sampling');
    const key = options === undefined ? 'default' : `${options.scaleMode}:${options.alphaMode}`;
    const resource = this.assets.getRequired<unknown>(assetId);
    if (!ImageSource.test(resource)) throw new Error('Expected a decoded image asset: ' + assetId);
    const cached = this.cache.get(resource)?.get(key);
    if (cached !== undefined) return cached;
    const texture = options === undefined ? Texture.from(resource) : new Texture({ source: new ImageSource({ resource, ...options }) });
    let variants = this.cache.get(resource);
    if (!variants) { variants = new Map(); this.cache.set(resource, variants); }
    variants.set(key, texture);
    this.textures.add(texture);
    return texture;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    const errors: unknown[] = [];
    for (const texture of this.textures) {
      try { texture.destroy(true); } catch (error) { errors.push(error); }
    }
    this.textures.clear();
    this.cache = new WeakMap();
    if (errors.length) throw new AggregateError(errors, 'Pixi texture cache disposal failed');
  }
}
