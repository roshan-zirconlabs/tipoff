import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddressMark } from "@/components/account";
import { daysLabel } from "@/components/call-card";
import { ShareRow } from "@/components/share-row";
import { Stamp } from "@/components/stamp";
import { type Call, calls, cleanLabel, verifiedCreator } from "@/lib/calls";
import { explorerTx } from "@/lib/config";
import { dateTime, pad, shortAddress, usdc } from "@/lib/format";
import { loadSnapshot } from "@/lib/server/snapshot";
import { receiptPath, shareLinks, shareText, siteUrl } from "@/lib/share";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ tipId: string }>; searchParams: Promise<{ c?: string; n?: string }> };

async function load(props: Props) {
  const { tipId } = await props.params;
  const { c, n } = await props.searchParams;
  const id = Number(tipId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const snapshot = await loadSnapshot();
  const call = calls(snapshot).find((x) => x.tipId === id);
  if (!call) return null;
  const creator = verifiedCreator(call, c);
  const label = creator ? cleanLabel(n) : null;
  const tip = snapshot.tips.find((t) => t.tipId === id);
  return { call, creator, label, commitTx: tip?.txHash };
}

function patronOf(call: Call) {
  return call.patronName || shortAddress(call.patron);
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props).catch(() => null);
  if (!data) return { title: "Call" };
  const { call, creator, label } = data;
  const path = receiptPath(call.tipId, creator, label);
  const og = `/api/og/call/${call.tipId}${path.includes("?") ? path.slice(path.indexOf("?")) : ""}`;
  const title = `Called it ${daysLabel(call.daysEarly)} · ${patronOf(call)}`;
  const description = shareText({ label, daysEarly: call.daysEarly, patron: patronOf(call) });
  return {
    title,
    description,
    metadataBase: new URL(siteUrl()),
    openGraph: { title, description, images: [og] },
    twitter: { card: "summary_large_image", title, description, images: [og] },
  };
}

export default async function CallPage(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { call, creator, label, commitTx } = data;
  const url = `${siteUrl()}${receiptPath(call.tipId, creator, label)}`;
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
