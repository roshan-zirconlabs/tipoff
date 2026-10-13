/**
 * The demo patrons we run ourselves, with test dollars, to show the product end to end. The hackathon rules ask us to
 * be honest about which programs are real and which are the team's, so the UI badges these. Override the set with
 * NEXT_PUBLIC_TEAM_SPONSORS (comma-separated) when the demo wallets change.
 */
const DEFAULT_TEAM_SPONSORS = [
  "0xd4304f21f3c18845d8c14878cc9e53c7cc658926", // Low Tide Records (programs 1, 3)
  "0x1d5f344d64696118c91d35cc8ef4c7536b01f35c", // Glasshouse DAO (programs 2, 4)
  "0x5b8cb5dbaadfed0b390a0d203f1fbe6cd6763958", // Signal FM (program 5)
];

const TEAM_SPONSORS = new Set(
  (process.env.NEXT_PUBLIC_TEAM_SPONSORS?.split(",") ?? DEFAULT_TEAM_SPONSORS)
    .map((a) => a.trim().toLowerCase())
    .filter((a) => /^0x[0-9a-f]{40}$/.test(a)),
);

/** True when a program is one the team runs for the demo, not a real outside patron. */
export function isTeamProgram(sponsor: string | null | undefined): boolean {
  return !!sponsor && TEAM_SPONSORS.has(sponsor.toLowerCase());
}
