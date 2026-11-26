/*
 * The Orluno mark, drawn for this site (AI placeholder until the owner's logo arrives; referensi/tools/apply-owner-assets.mjs swaps
 * in the owner's files). Two runs of the same rules: a frame split in two columns, the right one dropped a step, like a backtest
 * and its paper run side by side. currentColor, so it works on paper and on ink.
 */
export function Mark({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="currentColor" className={className} aria-hidden="true">
      <path d="M0 0h25v8H8v40h17v8H0z" />
      <path d="M31 8h25v48H31v-8h17V16H31z" />
      <rect x="13" y="13" width="12" height="25" />
      <rect x="31" y="21" width="12" height="22" />
    </svg>
  );
}
