"use client";

import { useState } from "react";
import { buttonClass } from "./ui";

export function ShareRow({ url, x, farcaster }: { url: string; x: string; farcaster: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <a className={buttonClass("primary", "md")} href={farcaster} target="_blank" rel="noreferrer">
        Share on Farcaster
      </a>
      <a className={buttonClass("outline", "md")} href={x} target="_blank" rel="noreferrer">
        Share on X
      </a>
      <button
        type="button"
        className={buttonClass("ghost", "md")}
        onClick={async () => {
          await navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
