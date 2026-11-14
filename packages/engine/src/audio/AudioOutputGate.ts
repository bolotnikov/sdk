import { Howler } from 'howler';

/** Page-lifetime output suppression for isolated tests; never changes player preferences. */
export class AudioOutputGate {
  private static suppressed = false;

  static silenceForPage(): void {
    this.suppressed = true;
    Howler.mute(true);
  }

  static get silent(): boolean { return this.suppressed; }
  static resolveMuted(requested: boolean): boolean { return this.suppressed || requested; }
}
