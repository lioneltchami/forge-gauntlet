import Image from "next/image";

const GITHUB = "https://github.com/lioneltchami/forge-gauntlet";

const STAGES = [
  {
    n: "1.0",
    stage: "1",
    name: "Bar",
    copy: "Name a real reference the critic can fetch. Vague AAA fails closed.",
  },
  {
    n: "2.0",
    stage: "2",
    name: "Build",
    copy: "Implementer writes artifacts. Orchestrator never codes the piece.",
  },
  {
    n: "3.0",
    stage: "3",
    name: "Blind",
    copy: "Fresh critic. Labels stripped. Binary pick — ours or the bar.",
  },
  {
    n: "4.0",
    stage: "4",
    name: "Gap",
    copy: "One sentence only. Feed that back. Loop again.",
  },
  {
    n: "5.0",
    stage: "5",
    name: "Smooth",
    copy: "Integrated whole must cohere before the run can close.",
  },
  {
    n: "6.0",
    stage: "6",
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
          <a href="#workflow">Workflow</a>
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
            <h1 className="brand">
              Forge
              <br />
              <span className="accent">Gauntlet</span>
            </h1>
            <p className="hero-line">
              Six stages. One bar. Blind critic. Loop until yours wins — or you
              stop.
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href="#install">
                Don the runtime
              </a>
              <a className="btn btn-ghost" href="#workflow">
                See the stages
              </a>
            </div>
            <p className="hero-meta">
              Technique by Matt Shumer · Open harness by Forge Gauntlet
            </p>
          </div>
        </section>

        <section className="workflow" id="workflow">
          <div className="workflow-inner">
            <div className="workflow-intro">
              <h2>How a run moves</h2>
              <p>
                Not six identical tiles — six hard gates in order. Miss one and
                the run stays open.
              </p>
            </div>
            <ol className="stages">
              {STAGES.map((s) => (
                <li key={s.n} className="stage" data-stage={s.stage}>
                  <div className="stage-num">{s.n}</div>
                  <div className="stage-body">
                    <h3>{s.name}</h3>
                    <p>{s.copy}</p>
                  </div>
                  <div className="stage-mark" aria-hidden />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="belief" id="belief">
          <div className="belief-inner">
            <h2>What we refuse</h2>
            <ul className="claims">
              <li>
                Goal is the destination. Architecture belongs to the agent.
              </li>
              <li>The builder never grades its own work.</li>
              <li>No fixed round count. You are the brake.</li>
              <li>
                Watch the ledger. Don’t poke the run every twenty minutes.
              </li>
            </ul>
          </div>
        </section>

        <section className="install" id="install">
          <div className="install-inner">
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
            <div className="install-cta">
              <a
                className="btn btn-primary"
                href={GITHUB}
                target="_blank"
                rel="noreferrer"
              >
                Open the forge
              </a>
            </div>
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

      <footer className="site-footer">
        <div className="footer-inner">
          <p className="footer-statement">
            Keep the bar real. Keep the critic blind. Keep going until you stop.
          </p>
          <div className="footer-meta">
            <span>Forge Gauntlet · MIT</span>
            <a href={GITHUB} target="_blank" rel="noreferrer">
              github.com/lioneltchami/forge-gauntlet
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
