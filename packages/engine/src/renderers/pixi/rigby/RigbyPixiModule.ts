import { DiTokens } from '../../../di/tokens';
import { PixiServices } from '../PixiServices';
import { RigbySkeletonFactory } from './internal/RigbySkeletonFactory';
import type { EngineModule } from '../../../core/EngineModule';
import type { DiContainerInterface } from '../../../di/types';

/** Explicit opt-in: other renderers and ordinary Pixi games do not load Rigby2D. */
export class RigbyPixiModule implements EngineModule {
  register(container: DiContainerInterface): void {
    const factory = new RigbySkeletonFactory(container.get(PixiServices.TextureAssetResolver));
    container.register({ token: DiTokens.element('RigbySkeleton'), useValue: factory.factory(), source: 'system' });
  }
}
