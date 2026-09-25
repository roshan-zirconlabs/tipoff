/** Contract custom errors → sentences a scout or sponsor can act on. Shared by server and client. */
export const contractErrorMessages: Record<string, string> = {
  TokenNotAllowed: "That token isn't accepted for bounties.",
  InvalidParams: "Some program settings are out of range.",
  ProgramNotFound: "That program doesn't exist.",
  TipNotFound: "That tip doesn't exist.",
  Expired: "The signature expired. Try again.",
  InvalidSignature: "The signature didn't match. Unlock your passkey and try again.",
  TippingClosed: "Tipping for this program has closed.",
  SponsorCannotTip: "Sponsors can't tip their own program.",
  TipLimitReached: "You've used all your tips for this program.",
  NotSponsor: "Only the program's sponsor can do that.",
  AlreadyActed: "That candidate is already resolved.",
  ActedOutsideWindow: "That action falls outside the program's window.",
  ResolutionClosed: "The program's window has closed.",
  NoHit: "The sponsor hasn't acted on that candidate.",
  AlreadySettled: "That hit has already been paid out.",
  ClaimClosed: "The claim window for that hit has closed.",
  ClaimStillOpen: "Scouts can still claim this hit. It pays out after the claim window.",
  InvalidProof: "That tip doesn't match this candidate.",
  TipAfterAction: "That tip was sent after the sponsor acted, so it doesn't count.",
  AlreadyProven: "That tip is already claimed.",
  NotInTopK: "Earlier scouts already claimed every paid spot for this hit.",
  TailNotOver: "The bounty stays locked until the tail period ends.",
  HitsOpen: "Pay out open hits before withdrawing.",
};

export function friendlyContractError(name: string | undefined): string {
  return (name && contractErrorMessages[name]) ?? "The transaction was rejected. Please try again.";
}
