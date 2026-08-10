import Image from "next/image";

const GITHUB = "https://github.com/lioneltchami/forge-gauntlet";

const STAGES = [
  {
    id: "stage-1",
    n: "1.0",
    name: "Bar",
    weight: "featured" as const,
    copy: "Name a real reference the critic can fetch. Vague AAA fails closed.",
  },
  {
    id: "stage-2",
    n: "2.0",
    name: "Build",
    weight: "dense" as const,
    copy: "Implementer writes artifacts. Orchestrator never codes the piece.",
  },
  {
    id: "stage-3",
    n: "3.0",
    name: "Blind",
    weight: "featured" as const,
    copy: "Fresh critic. Labels stripped. Binary pick — ours or the bar.",
  },
  {
    id: "stage-4",
    n: "4.0",
    name: "Gap",
    weight: "dense" as const,
    copy: "One sentence only. Feed that back. Loop again.",
  },
  {
    id: "stage-5",
    n: "5.0",
    name: "Smooth",
    weight: "dense" as const,
    copy: "Integrated whole must cohere before the run can close.",
  },
  {
    id: "stage-6",
    n: "6.0",
    name: "Win",
    weight: "finale" as const,
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
              Gauntlet
            </h1>
            <div className="brand-rule" aria-hidden />
            <p className="hero-line">
              Six stages. One bar. Blind critic. Loop until yours wins — or you
              stop.
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href="#install">
                Don the runtime
              </a>
              <a className="btn btn-ghost" href="#stage-1">
                Start at 1.0
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
              {STAGES.map((s, i) => (
                <li
                  key={s.id}
                  id={s.id}
                  className={`stage stage-${s.weight}`}
                  data-stage={s.n}
                >
                  <div className="stage-label">
                    <span className="stage-num">{s.n}</span>
                    <h3 className="stage-name">{s.name}</h3>
                  </div>
                  <div className="stage-body">
                    <p>{s.copy}</p>
                    {i < STAGES.length - 1 ? (
                      <a className="stage-jump" href={`#${STAGES[i + 1].id}`}>
                        Next · {STAGES[i + 1].n} {STAGES[i + 1].name}
                      </a>
                    ) : (
                      <a className="stage-jump" href="#install">
                        Run it
                      </a>
                    )}
                  </div>
                  <div className="stage-visual" aria-hidden>
                    <span className="stage-visual-num">{s.n}</span>
                    <span className="stage-visual-bar" />
                  </div>
                </li>
              ))}
            </ol>
            <div className="workflow-foot">
              <a className="btn btn-primary" href="#stage-1">
                Start at stage 1.0
              </a>
            </div>
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
