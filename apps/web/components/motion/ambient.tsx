/**
 * The "lucid" layer: three soft lights drifting behind everything. CSS only (transforms on fixed layers), so it costs
 * almost nothing, never blocks content, and stops for reduced motion via the global rule.
 */
export function Ambient() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="ambient-light ambient-a" />
      <div className="ambient-light ambient-b" />
      <div className="ambient-light ambient-c" />
    </div>
  );
}
