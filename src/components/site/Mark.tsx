/*
 * The Orluno mark: the owner's logo (public/brand/mark.webp, built by referensi/tools/apply-owner-assets.mjs) used as a CSS mask
 * filled with currentColor, so the same file works on paper and on ink.
 */
const MARK_URL = "url(/brand/mark.webp?v=9274304f)";

export function Mark({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="brand-mark"
      className={className}
      style={{
        display: "inline-block",
        flexShrink: 0,
        width: size,
        height: size,
        backgroundColor: "currentColor",
        WebkitMaskImage: MARK_URL,
        maskImage: MARK_URL,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}
