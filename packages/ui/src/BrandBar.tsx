export type BrandBarLink = {
  key: string;
  name: string;
  /** Same-origin `/go/<brand>` link, so the bag and sign-in travel with the shopper. */
  href: string;
  active: boolean;
};

export function BrandBar({ links, message }: { links: readonly BrandBarLink[]; message: string }) {
  return (
    <div className="bg-black text-xs tracking-[0.12em] text-white uppercase">
      <nav aria-label="L'Oréal brands" className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 md:px-10">
        <div className="flex flex-wrap items-center gap-4 md:gap-5">
          <span className="hidden text-[#B3B3B3] sm:inline">One bag:</span>
          {links.map((link) => (
            <a
              key={link.key}
              href={link.href}
              aria-current={link.active ? "page" : undefined}
              data-testid={`brand-link-${link.key}`}
              className={`text-white no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white ${link.active ? "underline underline-offset-4" : "hover:opacity-80"}`}
            >
              {link.name}
            </a>
          ))}
        </div>
        <span className="hidden text-[10px] tracking-[0.14em] md:inline">{message}</span>
      </nav>
    </div>
  );
}
