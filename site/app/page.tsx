const GITHUB = "https://github.com/lioneltchami/gauntlet";

export default function HomePage() {
  return (
    <>
      <header className="site-nav">
        <a href="#top" aria-label="Gauntlet home">
          GAUNTLET
        </a>
        <nav className="nav-links" aria-label="Primary">
          <a href="#loop">Loop</a>
          <a href="#install">Install</a>
          <a href={GITHUB} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-label="Hero">
          <div className="hero-plane" aria-hidden />
          <div className="hero-inner">
            <h1 className="brand">
              Gaunt<span>let</span>
            </h1>
            <p className="hero-line">
              Quality loops that won’t stop until they beat a real bar — not
              another multi-model chat.
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href="#install">
                Install runtime
              </a>
              <a
                className="btn btn-ghost"
                href={GITHUB}
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub
              </a>
            </div>
            <p className="hero-meta">
              Technique by Matt Shumer · Runtime by builders who refuse soft
              scores
            </p>
          </div>
        </section>

        <section className="not-chat" id="not-chat">
          <div className="section-inner split">
            <div>
              <p className="kicker">Positioning</p>
              <h2>Not a chat room with five models</h2>
              <p className="lede">
                <a
                  href="https://www.trygauntlet.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  trygauntlet.com
                </a>{" "}
                aggregates answers. Gauntlet Runtime enforces a standard: named
                bar, fetched evidence, blind A/B, binary win.
              </p>
            </div>
            <div className="compare" role="list">
              <div className="bad" role="listitem">
                <h3>Chat aggregator</h3>
                <ul>
                  <li>Pick a model, pad a reply</li>
                  <li>“Looks good” vibes</li>
                  <li>No fetched reference</li>
                  <li>Builder grades itself</li>
                </ul>
              </div>
              <div className="good" role="listitem">
                <h3>Gauntlet Runtime</h3>
                <ul>
                  <li>Named, fetchable bar</li>
                  <li>Blind critic, fresh each retry</li>
                  <li>ours | bar — one gap</li>
                  <li>Human + budget outrank the loop</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="loop">
          <div className="section-inner split">
            <div>
              <p className="kicker">The loop</p>
              <h2>Aim. Build. Blind audit. Iterate.</h2>
              <p className="lede">
                Fan out pieces. Separate implementer from critic. Keep going
                until yours wins side-by-side — or you pull the brake.
              </p>
            </div>
            <ol className="loop">
              <li>
                <div>
                  <strong>Name the bar</strong>
                  <p>
                    Stripe pricing. Nike Running. A Julia Evans post. Vague
                    “AAA” fails closed.
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <strong>Build the piece</strong>
                  <p>
                    Claude / Codex / Cursor spawn into artifacts. Orchestrator
                    never implements.
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <strong>Blind critic</strong>
                  <p>
                    Labels stripped. Fresh context. Binary pick + one sentence
                    gap. No 1–10 scores.
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <strong>Smooth + adversarial</strong>
                  <p>
                    Risky pieces get a second opinion. Integrated whole must
                    pass smoothing before done.
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
              Open source CLI + skill. You bring Claude Max / Codex /
              OpenRouter. We bring the harness.
            </p>
            <pre className="terminal" tabIndex={0}>
              <code>
                <span className="cmt"># clone + install</span>
                {"\n"}
                <span className="prompt">$</span> git clone {GITHUB}.git
                {"\n"}
                <span className="prompt">$</span> cd gauntlet && npm install
                {"\n\n"}
                <span className="cmt"># propose bars, then run a loop</span>
                {"\n"}
                <span className="prompt">$</span> npm run gauntlet -- propose
                &quot;dark athletic landing&quot;
                {"\n"}
                <span className="prompt">$</span> npm run gauntlet -- run --bar
                a --goal &quot;…&quot; --spawn-agent
                {"\n\n"}
                <span className="cmt"># Cursor / Claude skill</span>
                {"\n"}
                <span className="prompt">$</span> cp -R skills/gauntlet
                ~/.cursor/skills/gauntlet
              </code>
            </pre>
            <p className="credit" style={{ marginTop: "2rem" }}>
              Technique by{" "}
              <a
                href="https://github.com/mshumer"
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
              ). Role-split patterns adapted from{" "}
              <a
                href="https://github.com/NicholasSpisak/gauntlet-loop"
                target="_blank"
                rel="noreferrer"
              >
                Spisak
              </a>
              . Apex lessons from{" "}
              <a
                href="https://github.com/jolbol1/apex-gp"
                target="_blank"
                rel="noreferrer"
              >
                apex-gp
              </a>
              .
            </p>
          </div>
        </section>
      </main>

      <footer>
        <div className="footer-inner">
          <span>GAUNTLET RUNTIME · MIT</span>
          <a href={GITHUB} target="_blank" rel="noreferrer">
            github.com/lioneltchami/gauntlet
          </a>
        </div>
      </footer>
    </>
  );
}
