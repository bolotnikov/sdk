import type * as Pixi from 'pixi.js';
import type { RigbyRuntimeApi } from '../../src/renderers/pixi/rigby/internal/types';
/** Type boundary for the unmodified upstream JavaScript distribution. */
export declare function rigbyPixi(pixi: Pick<typeof Pixi, 'Assets' | 'Container' | 'DOMAdapter' | 'Mesh' | 'MeshGeometry' | 'Shader' | 'Texture' | 'Ticker' | 'Buffer' | 'BufferUsage' | 'compileHighShaderGlProgram' | 'compileHighShaderGpuProgram' | 'localUniformBit' | 'localUniformBitGl' | 'roundPixelsBit' | 'roundPixelsBitGl' | 'textureBit' | 'textureBitGl'>): RigbyRuntimeApi;
