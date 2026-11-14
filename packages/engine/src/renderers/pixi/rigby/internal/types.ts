import type { Container, Texture } from 'pixi.js';
import type { TextureSampling } from '../../../../layouts/assets/TextureAssetResolver';

/** Narrow structural ports for the unmodified, versioned upstream runtime. */
export interface RigbyView extends Container {
  readonly animationNames: readonly string[];
  readonly meshCount: number;
  timeScale: number;
  play(name: string, loop: boolean): unknown;
  update(seconds: number): void;
}
export interface RigbyAttachment {
  readonly name: string;
  readonly type: string;
  readonly image: string;
  readonly sequence?: unknown;
}
export interface RigbySkeletonData {
  validate(): string | null;
  readonly slots: readonly { readonly attachments: readonly RigbyAttachment[] }[];
  readonly skins: readonly { readonly slots: readonly { readonly attachments: readonly RigbyAttachment[] }[] }[];
}
export interface RigbyData {
  readonly animationNames: readonly string[];
  readonly atlas: unknown;
  readonly skeleton: RigbySkeletonData;
}
export type RigbyPageTextureResolver = (name: string, sampling: TextureSampling) => Texture;
export interface RigbyRuntimeApi {
  parseRigby(skeleton: ArrayBuffer | Record<string, unknown>, atlas: string, pages: Map<string, Texture>): RigbyData;
  RigbyData: new (skeleton: RigbySkeletonData, atlas: unknown, pages: Map<string, Texture>) => RigbyData;
  RigbySkeleton: new (data: RigbyData, options: { animation?: string; loop: boolean; autoUpdate: false }) => RigbyView;
}
