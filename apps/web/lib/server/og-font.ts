import "server-only";

// Share images use the brand face (Bricolage Grotesque). Fetched once per process from Google Fonts as WOFF, which
// the image renderer supports; if the fetch fails, images fall back to the default sans rather than failing.

type OgFont = { name: string; data: ArrayBuffer; weight: 500 | 800; style: "normal" };
let fonts: Promise<OgFont[]> | null = null;

async function load(): Promise<OgFont[]> {
  const css = await fetch(
    "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500&family=Bricolage+Grotesque:wght@800",
    // An older user agent makes Google serve WOFF instead of WOFF2.
    { headers: { "user-agent": "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 Chrome/12.0 Safari/534.30" } },
  ).then((r) => r.text());
  const faces = [...css.matchAll(/font-weight:\s*(\d+);[\s\S]*?src:\s*url\((https:[^)]+)\)/g)];
  const out = await Promise.all(
    faces.map(async ([, weight, url]) => ({
      name: "Bricolage",
      data: await fetch(url as string).then((r) => r.arrayBuffer()),
      weight: (Number(weight) === 800 ? 800 : 500) as 500 | 800,
      style: "normal" as const,
    })),
  );
  if (!out.length) throw new Error("no fonts");
  return out;
}

export function ogFonts(): Promise<OgFont[]> {
  fonts ??= load().catch(() => {
    fonts = null; // retry next time
    return [];
  });
  return fonts;
}
