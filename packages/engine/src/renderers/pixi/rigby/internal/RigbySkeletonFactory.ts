import { SchemaDecoder as S } from '../../../../validation';
import { RigbySkeleton } from '../RigbySkeleton';
import { RigbyRuntime } from './RigbyRuntime';
import type { ElementFactory } from '../../../../di/ElementFactoriesGroup';
import type { TextureAssetResolver } from '../../../../layouts/assets/TextureAssetResolver';

/** Resolves preloaded SDK assets and decodes authored node properties before runtime creation. */
export class RigbySkeletonFactory {
  private static readonly props = S.object({
    skeleton: S.string({ nonEmpty: true }),
    atlas: S.string({ nonEmpty: true }),
    pages: S.array(S.object({ name: S.string({ nonEmpty: true }), asset: S.string({ nonEmpty: true }) })),
    animation: S.optional(S.string({ nonEmpty: true })),
    loop: S.optional(S.boolean()),
    timeScale: S.optional(S.number({ min: 0 })),
  });
  constructor(private readonly textures: Pick<TextureAssetResolver, 'getRequiredTexture'>, private readonly runtime = new RigbyRuntime()) {}

  factory(): ElementFactory {
    return (id, config, context) => {
      const props = S.decode(config.props ?? {}, RigbySkeletonFactory.props, id + '.props');
      const skeleton = context.assets.getRequired<unknown>(props.skeleton);
      const atlas = S.decode(context.assets.getRequired<unknown>(props.atlas), S.string({ nonEmpty: true }), props.atlas);
      const data = skeleton instanceof ArrayBuffer ? skeleton : S.decode(skeleton, S.record(), props.skeleton);
      const pages = new Map(props.pages.map(({ name, asset }) => [name, asset]));
      if (pages.size !== props.pages.length) throw new Error(id + ': duplicate Rigby atlas page mapping');
      const view = this.runtime.create(data, atlas, (name, sampling) => {
        const asset = pages.get(name);
        if (asset === undefined) throw new Error(`Missing Rigby atlas page mapping '${name}' on '${id}'`);
        return this.textures.getRequiredTexture(asset, sampling);
      }, props.animation, props.loop ?? true);
      const node = new RigbySkeleton(view, props.animation, props.loop ?? true);
      node.setTimeScale(props.timeScale ?? 1);
      return { id, object: node };
    };
  }
}
