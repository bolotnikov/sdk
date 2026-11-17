/** Delays loading module entry points until Bridge initialization has completed. */
export class PlaygamaBootstrapHtmlTransform {
  static transform(html: string): string {
    return html.replace(/<script\b([^>]*)>\s*<\/script>/gi, (tag: string, attributes: string) => {
      if (!/\btype\s*=\s*(['"])module\1/i.test(attributes)) return tag;
      const source = /\bsrc\s*=\s*(['"])(.*?)\1/i.exec(attributes)?.[2];
      if (!source) return tag;
      const specifier = JSON.stringify(source).replace(/</g, '\\u003c');
      return `<script type="module">await window.bridge.initialize(); await import(${specifier});</script>`;
    });
  }
}
