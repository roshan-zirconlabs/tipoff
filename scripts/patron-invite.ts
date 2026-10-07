// Prints a pre-filled program link for a patron. They open it, sign in with their own passkey, tap "Get test dollars",
// and open the program: tips are sealed to *their* key, so we never hold anything of theirs.
//
//   node scripts/patron-invite.ts --name "Low Tide Records" --title "Artists we'll sign" \
//     --brief "We sign two independent artists a season." --looking "Unsigned, a real local crowd" \
//     [--bounty 750 --reward 250 --days 14] [--site https://tipoff.example]

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(`--${flag}`);
  return i >= 0 ? args[i + 1] : undefined;
};

// Pass the domain the patron should use; the app itself works on any domain attached to the deployment.
const site = (get("site") ?? process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const q = new URLSearchParams();
for (const [flag, key] of [
  ["name", "name"],
  ["title", "title"],
  ["brief", "brief"],
  ["looking", "looking"],
  ["bounty", "bounty"],
  ["reward", "reward"],
  ["days", "days"],
] as const) {
  const v = get(flag);
  if (v) q.set(key, v);
}
if (!q.has("name") || !q.has("title")) {
  console.error(
    'Usage: node scripts/patron-invite.ts --name "<patron>" --title "<program title>" [--brief …] [--looking …]',
  );
  process.exit(1);
}
console.log(`${site}/sponsor/new?${q.toString()}`);
