import { SchemaDecoder } from '@engine/validation';

import type { LocaleDictionary } from './Locales';

export class LocaleDictionaryConfigDecoder {
  private static readonly OPTIONAL_RECORD = SchemaDecoder.record({ defaultValue: {} });
  private static readonly OPTIONAL_STRING = SchemaDecoder.string({ nonEmpty: true, defaultValue: '' });
  private static readonly NON_EMPTY_STRING = SchemaDecoder.string({ nonEmpty: true });

  /** Reads the usable entries of an optional runtime dictionary. */
  static decodeAvailable(input: unknown, source: string): LocaleDictionary {
    const dict = SchemaDecoder.decode(input, this.OPTIONAL_RECORD, source);
    const entries = Object.entries(dict).map(([key, value]) =>
      [key, SchemaDecoder.decode(value, this.OPTIONAL_STRING, source, `$.${key}`)] as const);
    return Object.fromEntries(entries.filter(([, value]) => value.length > 0));
  }

  static decode(input: unknown, source: string): LocaleDictionary {
    const dict = SchemaDecoder.decode(input, SchemaDecoder.record(), source);
    const normalizedDict: Record<string, string> = {};

    for (const [key, value] of Object.entries(dict)) {
      normalizedDict[key] = SchemaDecoder.decode(
        value,
        LocaleDictionaryConfigDecoder.NON_EMPTY_STRING,
        source,
        `$.${key}`,
      );
    }

    return normalizedDict;
  }
}
