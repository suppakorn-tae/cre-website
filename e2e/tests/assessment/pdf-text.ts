import { inflateSync } from 'node:zlib';

/**
 * Minimal text extraction for the Skia/PDF files Gotenberg (Chromium) writes:
 * classic objects, Flate streams, Identity-H fonts with a ToUnicode CMap.
 * It avoids a PDF dependency and a poppler install on the runner. Returns the
 * decoded text runs joined with single spaces, in drawing order.
 */
export function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const objects = new Map<number, { dict: string; stream?: string }>();
  const re = /(\d+) 0 obj\b([\s\S]*?)endobj/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const body = m[2]!;
    const s = body.indexOf('stream');
    const dict = s < 0 ? body : body.slice(0, s);
    let stream: string | undefined;
    if (s >= 0) {
      let start = s + 'stream'.length;
      if (body[start] === '\r') start++;
      if (body[start] === '\n') start++;
      const end = body.lastIndexOf('endstream');
      let data = Buffer.from(body.slice(start, end), 'latin1');
      if (/\/FlateDecode/.test(dict)) {
        try {
          data = inflateSync(data);
        } catch {
          continue;
        }
      }
      stream = data.toString('latin1');
    }
    objects.set(Number(m[1]), { dict, stream });
  }

  // Font object number -> glyph code -> unicode text.
  const cmaps = new Map<number, Map<number, string>>();
  const utf16 = (hex: string) => {
    let out = '';
    for (let i = 0; i < hex.length; i += 4)
      out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    return out;
  };
  for (const [id, o] of objects) {
    const to = /\/ToUnicode (\d+) 0 R/.exec(o.dict);
    if (!to) continue;
    const cmap = objects.get(Number(to[1]))?.stream ?? '';
    const map = new Map<number, string>();
    for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const p of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        map.set(parseInt(p[1]!, 16), utf16(p[2]!));
      }
    }
    for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const p of block[1]!.matchAll(
        /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g,
      )) {
        const lo = parseInt(p[1]!, 16);
        const hi = parseInt(p[2]!, 16);
        const first = utf16(p[3]!);
        for (let c = lo; c <= hi; c++) {
          map.set(
            c,
            first.slice(0, -1) + String.fromCharCode(first.charCodeAt(first.length - 1) + c - lo),
          );
        }
      }
    }
    cmaps.set(id, map);
  }

  const texts: string[] = [];
  for (const o of objects.values()) {
    // A page: its resources name the fonts, its contents hold the text.
    const contents = /\/Contents (\d+) 0 R/.exec(o.dict);
    if (!contents || !/\/Type \/Page\b/.test(o.dict)) continue;
    const res = /\/Resources (\d+) 0 R/.exec(o.dict);
    const resDict = res ? (objects.get(Number(res[1]))?.dict ?? '') : o.dict;
    const fontsRef = /\/Font (\d+) 0 R/.exec(resDict);
    const fontDict = fontsRef ? (objects.get(Number(fontsRef[1]))?.dict ?? '') : resDict;
    const fonts = new Map<string, number>();
    for (const f of fontDict.matchAll(/\/(\w+) (\d+) 0 R/g)) fonts.set(f[1]!, Number(f[2]));

    let current = new Map<number, string>();
    const stream = objects.get(Number(contents[1]))?.stream ?? '';
    const tokens = /\/(\w+) [\d.]+ Tf|\[((?:<[0-9a-fA-F]*>|[^\]<])*)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj/g;
    for (let t = tokens.exec(stream); t; t = tokens.exec(stream)) {
      if (t[1]) {
        const fontObj = fonts.get(t[1]);
        // The font dict points at the descendant, whose ToUnicode we indexed.
        current = (fontObj !== undefined && cmaps.get(fontObj)) || new Map();
        continue;
      }
      const hex =
        t[2] !== undefined
          ? [...t[2].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => x[1]!).join('')
          : t[3]!;
      let run = '';
      for (let i = 0; i + 4 <= hex.length; i += 4)
        run += current.get(parseInt(hex.slice(i, i + 4), 16)) ?? '';
      if (run) texts.push(run);
    }
  }
  return texts.join('');
}
