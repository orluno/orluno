import { Raster } from "@/components/site/Reveal";

/* Page title in the reference's pattern: a bold display line with a mono uppercase tail, a lede on the right rail. */
export function PageHead({ title, tail, lede, kicker, children }: { title: string; tail?: string; lede?: React.ReactNode; kicker?: string; children?: React.ReactNode }) {
  return (
    <section className="wrap" style={{ paddingTop: 64 }} data-sec="0">
      <div className="grid-main" style={{ rowGap: 24, alignItems: "end" }}>
        <div>
          {kicker ? (
            <p className="kicker" data-scramble="" style={{ margin: "0 0 14px" }}>
              {kicker}
            </p>
          ) : null}
          <Raster as="h1" className="h-sec">
            {title}
            {tail ? <span className="tail">{tail}</span> : null}
          </Raster>
        </div>
        {lede ? <div className="body rail-col keep">{lede}</div> : <div />}
      </div>
      {children}
    </section>
  );
}
