import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddressMark } from "@/components/account";
import { daysLabel } from "@/components/call-card";
import { CreatorChip } from "@/components/creator-chip";
import { ShareRow } from "@/components/share-row";
import { Stamp } from "@/components/stamp";
import { type Call, calls, cleanLabel, verifiedCreator } from "@/lib/calls";
import { explorerTx } from "@/lib/config";
import { miniappEmbed } from "@/lib/embed";
import { dateTime, pad, shortAddress, usdc } from "@/lib/format";
import { profileOwning } from "@/lib/server/farcaster";
import { requestOrigin } from "@/lib/server/origin";
import { loadSnapshot } from "@/lib/server/snapshot";
import { evidenceCreators } from "@/lib/server/trust";
import { receiptPath, shareLinks, shareText } from "@/lib/share";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ tipId: string }>; searchParams: Promise<{ c?: string; n?: string; h?: string }> };

async function load(props: Props) {
  const { tipId } = await props.params;
  const { c, n, h } = await props.searchParams;
  const id = Number(tipId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const snapshot = await loadSnapshot();
  const call = calls(snapshot).find((x) => x.tipId === id);
  if (!call) return null;
  // Shared with the creator's wallet (verified against the commitment), or known because the patron's payment named it.
  const creator =
    verifiedCreator(call, c) ??
    (call.source === "evidence"
      ? ((await evidenceCreators(snapshot.programs).catch(() => new Map())).get(
          `${call.programId}:${call.candidateId}`,
        ) ?? null)
      : null);
  // The scout's own words appear only on a link they shared with the creator's verified wallet.
  const label = verifiedCreator(call, c) ? cleanLabel(n) : null;
  const tip = snapshot.tips.find((t) => t.tipId === id);
  // A Farcaster face only when that handle has verified the very wallet this call named.
  const profile = await profileOwning(h, creator).catch(() => null);
  return { call, creator, label: label ?? profile?.displayName ?? null, profile, commitTx: tip?.txHash };
}

function patronOf(call: Call) {
  return call.patronName || shortAddress(call.patron);
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props).catch(() => null);
  if (!data) return { title: "Call" };
  const { call, creator, label, profile } = data;
  const path = receiptPath(call.tipId, creator, label, profile?.username);
  const og = `/api/og/call/${call.tipId}${path.includes("?") ? path.slice(path.indexOf("?")) : ""}`;
  const title = `Called it ${daysLabel(call.daysEarly)} · ${patronOf(call)}`;
  const description = shareText({ label, daysEarly: call.daysEarly, patron: patronOf(call) });
  return {
    title,
    description,
    metadataBase: new URL(await requestOrigin()),
    openGraph: { title, description, images: [og] },
    twitter: { card: "summary_large_image", title, description, images: [og] },
    other: miniappEmbed({
      origin: await requestOrigin(),
      imageUrl: `${og}${og.includes("?") ? "&" : "?"}ratio=3x2`,
      url: path,
      buttonTitle: "See the call",
    }),
  };
}

export default async function CallPage(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { call, creator, label, profile, commitTx } = data;
  const url = `${await requestOrigin()}${receiptPath(call.tipId, creator, label, profile?.username)}`;
  const links = shareLinks(url, shareText({ label, daysEarly: call.daysEarly, patron: patronOf(call) }));

  return (
    <div className="mx-auto max-w-3xl px-4 pt-12 sm:px-6 md:pt-16">
      <Link href="/calls" className="text-sm text-ink-3 transition hover:text-ink">
        ← All calls
      </Link>
      <article className="card relative mt-6 overflow-hidden p-7 sm:p-10">
        <div className="absolute right-6 top-6 hidden sm:block">
          <Stamp number={call.tipId} size={120} />
        </div>
        <p className="eyebrow">Called it · tip #{pad(call.tipId)}</p>
        <h1 className="display mt-5 max-w-[16ch] text-[clamp(2.4rem,6vw,3.8rem)] leading-[0.95]">
          {daysLabel(call.daysEarly)}.
        </h1>
        {profile && creator ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <CreatorChip profile={profile} wallet={creator} />
            <span className="rounded-full bg-ok-wash px-2.5 py-1 text-xs font-semibold text-ok">
              verified on Farcaster
            </span>
          </div>
        ) : null}
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
          <Link href={`/scouts/${call.scout}`} className="numeric text-ink underline-offset-4 hover:underline">
            {shortAddress(call.scout)}
          </Link>{" "}
          named{" "}
          {creator ? (
            <span className="text-ink">
              {label ? `${label} ` : ""}
              <span className="numeric">({shortAddress(creator)})</span>
            </span>
          ) : (
            "a creator"
          )}{" "}
          on {dateTime(call.committedAt)}. {patronOf(call)} paid them on {dateTime(call.actedAt)}
          {call.source === "evidence" ? ", proven by the payment itself" : ""}.
        </p>

        <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-rule pt-6 sm:grid-cols-3">
          <div>
            <dt className="eyebrow">Paid</dt>
            <dd className="numeric mt-1.5 text-2xl">{call.amount ? `$${usdc(call.amount)}` : "Claimed"}</dd>
          </div>
          <div>
            <dt className="eyebrow">Rank</dt>
            <dd className="numeric mt-1.5 text-2xl">#{call.rank}</dd>
          </div>
          <div>
            <dt className="eyebrow">Program</dt>
            <dd className="mt-1.5">
              <Link href={`/programs/${call.programId}`} className="hover:underline">
                {call.programTitle}
              </Link>
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-rule pt-6 text-sm text-ink-3">
          <AddressMark address={call.scout} size={18} />
          <span>
            The tip was sealed before the patron acted, so it couldn't have been copied from the news.
            {creator ? " The creator's wallet above is verified against the on-chain commitment." : ""}
          </span>
          {commitTx && explorerTx(commitTx) ? (
            <a className="text-ink-2 underline-offset-4 hover:underline" href={explorerTx(commitTx) ?? "#"}>
              sealed tx
            </a>
          ) : null}
        </div>
      </article>
      <ShareRow url={url} x={links.x} farcaster={links.farcaster} />
    </div>
  );
}
