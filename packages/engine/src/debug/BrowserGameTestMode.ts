import { AudioOutputGate } from '../audio/AudioOutputGate';

/** Call from a development-only import before constructing any engine/audio instance. */
export class BrowserGameTestMode {
  static configure(search: string = window.location.search): boolean {
    if (new URLSearchParams(search).get('silentTest') === '1') AudioOutputGate.silenceForPage();
    return this.silent;
  }

  static get silent(): boolean { return AudioOutputGate.silent; }
}
