import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-32 text-center sm:px-6">
      <p className="numeric text-6xl text-signal">404</p>
      <h1 className="display mt-4 text-4xl">Nothing sealed here.</h1>
      <p className="mt-3 text-ink-2">That page doesn't exist, or the program lives on a different chain.</p>
      <ButtonLink href="/programs" className="mt-8">
        Browse programs
      </ButtonLink>
    </div>
  );
}
