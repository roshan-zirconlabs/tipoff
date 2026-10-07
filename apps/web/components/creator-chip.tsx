import type { FarcasterProfile } from "@/lib/farcaster-types";
import { shortAddress } from "@/lib/format";

/** A creator as a person: Farcaster photo, name and handle, with the wallet that's actually being named. */
export function CreatorChip({
  profile,
  wallet,
  size = "md",
}: {
  profile: FarcasterProfile;
  wallet?: string | null;
  size?: "sm" | "md";
}) {
  const px = size === "sm" ? 22 : 36;
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      {profile.pfp ? (
        // biome-ignore lint/performance/noImgElement: Farcaster photos come from arbitrary hosts; next/image would need every host allowlisted
        <img
          src={profile.pfp}
          alt=""
          width={px}
          height={px}
          referrerPolicy="no-referrer"
          className="shrink-0 rounded-full border border-rule object-cover"
          style={{ width: px, height: px }}
        />
      ) : (
        <span
          className="grid shrink-0 place-items-center rounded-full bg-signal-wash text-xs font-semibold text-signal-ink"
          style={{ width: px, height: px }}
        >
          {profile.displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 leading-tight">
        <span className={`block truncate font-semibold ${size === "sm" ? "text-sm" : ""}`}>{profile.displayName}</span>
        <span className="numeric block truncate text-xs text-ink-3">
          @{profile.username}
          {wallet ? ` · ${shortAddress(wallet)}` : ""}
        </span>
      </span>
    </span>
  );
}
