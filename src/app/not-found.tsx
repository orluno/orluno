import Link from "next/link";

export default function NotFound() {
  return (
    <section className="wrap" style={{ padding: "120px var(--gutter) 200px" }}>
      <p className="ht-line halftone" style={{ fontSize: 160 }}>404</p>
      <h1 className="hd-3">No page here.</h1>
      <Link href="/" className="chip" style={{ marginTop: 16 }}>
        <span className="k">/</span>
        <span>home</span>
      </Link>
    </section>
  );
}
