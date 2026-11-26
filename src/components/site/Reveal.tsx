/* Fades a block up once it scrolls into view (driven by components/site/Motion.tsx). Without JavaScript or with reduced motion it is simply visible. */
export function Reveal({ children, className = "", delay = 0, as: Tag = "div", ...rest }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" | "article" | "p"; "data-testid"?: string }) {
  const Any = Tag as React.ElementType;
  return (
    <Any data-reveal="" className={className} style={delay ? ({ "--delay": `${delay}ms` } as React.CSSProperties) : undefined} {...rest}>
      {children}
    </Any>
  );
}

/** A heading that prints as dots, then fills in (the reference's raster reveal). */
export function Raster({ children, className = "", as: Tag = "h2", delay = 0, id }: { children: React.ReactNode; className?: string; as?: "h1" | "h2" | "h3" | "p" | "span" | "div"; delay?: number; id?: string }) {
  const Any = Tag as React.ElementType;
  return (
    <Any id={id} data-raster="" className={className} style={delay ? ({ "--delay": `${delay}ms` } as React.CSSProperties) : undefined}>
      {children}
    </Any>
  );
}
