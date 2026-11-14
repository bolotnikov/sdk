import { BaseLoader } from './BaseLoader';
import type { AssetDescriptor, Loader } from '../types';

/** Loads renderer-independent binary data through the SDK asset lifecycle. */
export class BinaryLoader extends BaseLoader implements Loader {
  async load(descriptor: AssetDescriptor, signal: AbortSignal, baseURL?: string): Promise<ArrayBuffer> {
    const response = await fetch(this.resolveUrl(descriptor, baseURL, 'Binary'), { signal });
    if (!response.ok) throw new Error(`Binary asset request failed: ${response.status} ${descriptor.id}`);
    return response.arrayBuffer();
  }
}
