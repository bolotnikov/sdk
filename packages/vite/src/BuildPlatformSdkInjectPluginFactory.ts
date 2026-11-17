import { BuildPlatformSdkCatalog } from './BuildPlatformSdkCatalog';
import { PlaygamaBootstrapHtmlTransform } from './PlaygamaBootstrapHtmlTransform';

import type { Plugin } from 'vite';

/**
 * Produces HTML transform plugin that injects platform SDK script tag.
 */
export class BuildPlatformSdkInjectPluginFactory {
  static create(
    platformId: string,
    options?: { readonly gameDistributionGameId?: string },
  ): Plugin {
    return {
      name: 'platform-sdk-inject',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
        const headTags = BuildPlatformSdkCatalog.resolveHeadTags(platformId, options);
        if (headTags.length === 0) {
          return;
        }
        return {
          html: platformId === 'playgama' ? PlaygamaBootstrapHtmlTransform.transform(html) : html,
          tags: headTags,
        };
        },
      },
    };
  }
}
