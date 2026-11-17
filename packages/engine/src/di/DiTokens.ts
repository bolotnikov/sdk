import type { DiToken } from './DiToken';

export class DiTokens {
  private static create<T>(kind: string, name: string): DiToken<T> {
    return Object.freeze({kind, name, key: `${kind}:${name}`});
  }
  static element<T = unknown>(name: string): DiToken<T> { return DiTokens.create('element', name); }
  static component<T = unknown>(name: string): DiToken<T> { return DiTokens.create('component', name); }
  static action<T = unknown>(name: string): DiToken<T> { return DiTokens.create('action', name); }
  static command<T = unknown>(name: string): DiToken<T> { return DiTokens.create('command', name); }
  static service<T = unknown>(name: string): DiToken<T> { return DiTokens.create('service', name); }
}
