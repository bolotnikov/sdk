import {
  Assets, Container, DOMAdapter, Mesh, MeshGeometry, Shader, Texture, Ticker, Buffer, BufferUsage,
  compileHighShaderGlProgram, compileHighShaderGpuProgram, localUniformBit, localUniformBitGl,
  roundPixelsBit, roundPixelsBitGl, textureBit, textureBitGl,
} from 'pixi.js';
import { rigbyPixi } from '../../../../../vendor/rigby2d/rigby2d-pixi-0.5.1.mjs';
import { RigbyAssetValidator } from './RigbyAssetValidator';
import type { RigbyPageTextureResolver, RigbyRuntimeApi, RigbyView } from './types';

/** Only this adapter depends on Rigby2D. Parsing and validation precede resource resolution. */
export class RigbyRuntime {
  private static readonly api: RigbyRuntimeApi = rigbyPixi({
    Assets, Container, DOMAdapter, Mesh, MeshGeometry, Shader, Texture, Ticker, Buffer, BufferUsage,
    compileHighShaderGlProgram, compileHighShaderGpuProgram, localUniformBit, localUniformBitGl,
    roundPixelsBit, roundPixelsBitGl, textureBit, textureBitGl,
  });
  private readonly validator = new RigbyAssetValidator();

  create(skeleton: ArrayBuffer | Record<string, unknown>, atlasText: string, resolveTexture: RigbyPageTextureResolver, animation: string | undefined, loop: boolean): RigbyView {
    const parsed = RigbyRuntime.api.parseRigby(skeleton, atlasText, new Map());
    const atlas = this.validator.validate(parsed, animation);
    const pages = new Map<string, Texture>();
    for (const page of atlas.pages) {
      const texture = resolveTexture(page.name, {
        scaleMode: (page.filter[1] ?? page.filter[0] ?? 'Linear').toLowerCase().startsWith('nearest') ? 'nearest' : 'linear',
        alphaMode: 'premultiply-alpha-on-upload',
      });
      if (texture.width !== page.width || texture.height !== page.height) throw new Error('Rigby atlas page size mismatch: ' + page.name);
      pages.set(page.name, texture);
    }
    const data = new RigbyRuntime.api.RigbyData(parsed.skeleton, parsed.atlas, pages);
    return new RigbyRuntime.api.RigbySkeleton(data, { ...(animation === undefined ? {} : { animation }), loop, autoUpdate: false });
  }
}
