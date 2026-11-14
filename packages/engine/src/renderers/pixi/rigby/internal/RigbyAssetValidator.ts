import { SchemaDecoder as S } from '../../../../validation';
import type { RigbyAttachment, RigbyData } from './types';

/** Validates cross-file references before textures or native meshes are created. */
export class RigbyAssetValidator {
  private static readonly atlas = S.object({ pages: S.array(S.object({
    name: S.string({ nonEmpty: true }), width: S.number({ integer: true, min: 1 }), height: S.number({ integer: true, min: 1 }),
    filter: S.array(S.string({ nonEmpty: true })), pma: S.boolean(),
    repeat: S.enumOf(['none'] as const),
    regions: S.array(S.object({
      name: S.string({ nonEmpty: true }), index: S.number({ integer: true, min: -1 }),
      x: S.number({ min: 0 }), y: S.number({ min: 0 }), width: S.number({ min: Number.MIN_VALUE }), height: S.number({ min: Number.MIN_VALUE }),
      rotate: S.number(),
    })),
  })) });
  private static readonly sequence = S.object({
    count: S.optional(S.number({ integer: true, min: 1 })), start: S.optional(S.number({ integer: true })),
    digits: S.optional(S.number({ integer: true, min: 0 })),
  });

  validate(data: RigbyData, animation: string | undefined) {
    const error = data.skeleton.validate();
    if (error) throw new Error('Invalid Rigby skeleton: ' + error);
    if (animation !== undefined && !data.animationNames.includes(animation)) throw new Error('Unknown Rigby animation: ' + animation);
    const atlas = S.decode(data.atlas, RigbyAssetValidator.atlas, 'Rigby atlas');
    if (!atlas.pages.length) throw new Error('Rigby atlas has no pages');
    const pages = new Set<string>(), regions = new Set<string>();
    for (const page of atlas.pages) {
      if (pages.has(page.name)) throw new Error('Duplicate Rigby atlas page: ' + page.name);
      pages.add(page.name);
      if (page.pma) throw new Error('Premultiplied Rigby atlases require a dedicated image decode policy; export straight alpha (pma: false)');
      for (const region of page.regions) {
        if (region.rotate % 90 !== 0) throw new Error('Rigby atlas rotation must be a multiple of 90: ' + region.name);
        const swap = Math.abs(region.rotate % 180) === 90;
        if (region.x + (swap ? region.height : region.width) > page.width || region.y + (swap ? region.width : region.height) > page.height) throw new Error('Rigby atlas region exceeds page bounds: ' + region.name);
        const name = region.index >= 0 ? `${region.name}${region.index}` : region.name;
        if (regions.has(name)) throw new Error('Duplicate Rigby atlas region: ' + name);
        regions.add(name);
      }
    }
    for (const slot of data.skeleton.slots) this.validateAttachments(slot.attachments, regions);
    for (const skin of data.skeleton.skins) for (const slot of skin.slots) this.validateAttachments(slot.attachments, regions);
    return atlas;
  }

  private validateAttachments(attachments: readonly RigbyAttachment[], regions: ReadonlySet<string>): void {
    for (const attachment of attachments) {
      if (!['region', 'mesh', 'linkedmesh'].includes(attachment.type)) continue;
      if (attachment.sequence !== undefined) {
        const sequence = S.decode(attachment.sequence, RigbyAssetValidator.sequence, 'Rigby attachment ' + attachment.name);
        for (let i = 0; i < (sequence.count ?? 1); i++) {
          this.requireRegion(`${attachment.image}${String((sequence.start ?? 1) + i).padStart(sequence.digits ?? 0, '0')}`, regions);
        }
      } else this.requireRegion(attachment.image, regions);
    }
  }

  private requireRegion(name: string, regions: ReadonlySet<string>): void {
    if (!regions.has(name)) throw new Error('Missing Rigby atlas region: ' + name);
  }
}
