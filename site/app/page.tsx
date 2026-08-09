import Image from "next/image";

const GITHUB = "https://github.com/lioneltchami/forge-gauntlet";

const STONES = [
  {
    gem: "lime",
    name: "Bar",
    copy: "Name a real reference. Vague AAA fails closed.",
  },
  {
    gem: "ember",
    name: "Build",
    copy: "Implementer writes artifacts. Orchestrator never codes.",
  },
  {
    gem: "steel",
    name: "Blind",
    copy: "Fresh critic. Labels stripped. Binary pick.",
  },
  {
    gem: "bone",
    name: "Gap",
    copy: "One sentence. Feed only that back. Loop.",
  },
  {
    gem: "oxide",
    name: "Smooth",
    copy: "Integrated whole must cohere before done.",
  },
  {
    gem: "gold",
    name: "Win",
    copy: "Ours beats the bar — or you pull the brake.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <header className="site-nav">
        <a
          className="brand-lockup"
          href="#top"
          aria-label="Forge Gauntlet home"
        >
          <Image src="/mark.png" alt="" width={28} height={28} />
          Forge Gauntlet
        </a>
        <nav className="nav-links" aria-label="Primary">
          <a href="#stones">Six stones</a>
          <a href="#method">Method</a>
          <a href="#install">Install</a>
          <a href={GITHUB} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-label="Hero">
          <div
            className="hero-media"
            role="img"
            aria-label="Forged gauntlet in a dark workshop"
          />
          <div className="hero-inner">
            <p className="eyebrow">Open quality ordeal · agent harness</p>
            <h1 className="brand">
              Forge
              <br />
              <em>Gauntlet</em>
            </h1>
            <p className="hero-line">
              Six stones. One bar. Blind critic. Loop until yours wins — or you
              stop.
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href="#install">
                Don the runtime
              </a>
              <a
                className="btn btn-ghost"
                href={GITHUB}
                target="_blank"
                rel="noreferrer"
              >
                Open the forge
              </a>
            </div>
            <p className="hero-meta">
              Technique by Matt Shumer · Runtime by Forge Gauntlet · Original
              forge mark
            </p>
          </div>
        </section>

        <section className="myth" id="stones">
          <div className="section-inner">
            <p className="kicker">The six stones</p>
            <h2>Your mythology. Your loop.</h2>
            <p className="lede">
              Six hard gates of the quality ordeal. Miss one and the run stays
              open.
            </p>
            <div className="stones">
              {STONES.map((s) => (
                <article key={s.name} className="stone" data-gem={s.gem}>
                  <strong>{s.name}</strong>
                  <p>{s.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="method">
          <div className="section-inner split">
            <div>
              <p className="kicker">The method</p>
              <h2>Destination, not architecture</h2>
              <p className="lede">
                Give the agent a goal and a real bar it can fetch. Let it split
                the work. Never let the builder grade itself. Keep looping — you
                are the brake.
              </p>
            </div>
            <ol className="loop">
              <li>
                <div>
                  <strong>Goal, not how</strong>
                  <p>
                    Destination only. Lead agent owns the route and the pieces.
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <strong>Real bar</strong>
                  <p>
                    Concrete reference to inspect — not “amazing” or
                    “production-ready.”
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <strong>Separate critic</strong>
                  <p>
                    Fresh context. Blind A/B when possible. One gap. No soft
                    scores.
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <strong>Watch, don’t poke</strong>
                  <p>
                    Live ledger and workbench. Stop when it’s good enough — or
                    budget hits.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="install" id="install">
          <div className="section-inner">
            <p className="kicker">Get it</p>
            <h2>Run it where your agents live</h2>
            <p className="lede">
              Open CLI + skill. You bring Claude Max / Codex / OpenRouter. We
              bring the harness.
            </p>
            <pre className="terminal" tabIndex={0}>
              <code>
                <span className="cmt"># clone + install</span>
                {"\n"}
                <span className="prompt">$</span> git clone {GITHUB}.git
                {"\n"}
                <span className="prompt">$</span> cd forge-gauntlet && npm
                install
                {"\n\n"}
                <span className="cmt"># propose bars, then run</span>
                {"\n"}
                <span className="prompt">$</span> npm run gauntlet -- propose
                &quot;dark athletic landing&quot;
                {"\n"}
                <span className="prompt">$</span> npm run gauntlet -- run --bar
                a --goal &quot;…&quot; --spawn-agent
                {"\n\n"}
                <span className="cmt"># Cursor skill</span>
                {"\n"}
                <span className="prompt">$</span> cp -R skills/gauntlet
                ~/.cursor/skills/gauntlet
              </code>
            </pre>
            <p className="credit">
              Method documented by{" "}
              <a
                href="https://somethingbig.ai/gauntlet-loop"
                target="_blank"
                rel="noreferrer"
              >
                Matt Shumer
              </a>{" "}
              (
              <a
                href="https://github.com/mshumer/Claude-of-Duty"
                target="_blank"
                rel="noreferrer"
              >
                Claude of Duty
              </a>
              ). Forge Gauntlet is the open runtime that enforces it.
            </p>
            <p className="legal-note">
              Visual mark is an original forge gauntlet. Not Marvel. No
              affiliation.
            </p>
          </div>
        </section>
      </main>

      <footer>
        <div className="footer-inner">
          <span>Forge Gauntlet · MIT</span>
          <a href={GITHUB} target="_blank" rel="noreferrer">
            github.com/lioneltchami/forge-gauntlet
          </a>
        </div>
      </footer>
    </>
  );
}
