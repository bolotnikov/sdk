import { BaseLoader } from './BaseLoader';
import type { AssetDescriptor, Loader } from '../types';

/** Loads renderer-independent text data through the SDK asset lifecycle. */
export class TextLoader extends BaseLoader implements Loader {
  async load(descriptor: AssetDescriptor, signal: AbortSignal, baseURL?: string): Promise<string> {
    const response = await fetch(this.resolveUrl(descriptor, baseURL, 'Text'), { signal });
    if (!response.ok) throw new Error(`Text asset request failed: ${response.status} ${descriptor.id}`);
    return response.text();
  }
}
