/**
 * Farcaster mini app embed tags (fc:miniapp, plus fc:frame for older clients): a shared link renders in the feed as a
 * 3:2 card with one button that opens the page. Spec: miniapps.farcaster.xyz/docs/guides/sharing.
 */
export function miniappEmbed(opts: {
  /** This request's origin (`requestOrigin()`): embeds need absolute URLs. */
  origin: string;
  imageUrl: string;
  url: string;
  buttonTitle: string;
}): Record<string, string> {
  const base = opts.origin.replace(/\/$/, "");
  const abs = (u: string) => (u.startsWith("http") ? u : `${base}${u}`);
  const action = {
    name: "Tipoff",
    url: abs(opts.url),
    splashImageUrl: `${base}/splash.png`,
    splashBackgroundColor: "#f4f0e6",
  };
  const embed = (type: string) =>
    JSON.stringify({
      version: "1",
      imageUrl: abs(opts.imageUrl),
      button: { title: opts.buttonTitle.slice(0, 32), action: { type, ...action } },
    });
  return { "fc:miniapp": embed("launch_miniapp"), "fc:frame": embed("launch_frame") };
}
