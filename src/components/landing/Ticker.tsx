import { TICKER_ITEMS } from "./content";

/** Scrolling strip of example outcomes. The list is rendered twice for a seamless loop. */
export function Ticker() {
  return (
    <section className="lp-ticker" aria-label="Examples of calls Trellient Voice handles">
      <div className="lp-container lp-ticker__inner">
        <p className="lp-ticker__label">What your agent handles</p>
        <div className="lp-marquee">
          <div className="lp-marquee__track">
            {[0, 1].map((copy) => (
              <ul key={copy} className="lp-marquee__list" aria-hidden={copy === 1 ? true : undefined}>
                {TICKER_ITEMS.map((item) => (
                  <li key={item.who}>
                    <span className="lp-marquee__who">{item.who}</span>
                    <span className="lp-marquee__what">{item.what}</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
