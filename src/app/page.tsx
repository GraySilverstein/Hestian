import {
  MODULES,
  PRODUCT_PILLARS,
  modulesByLayer,
  type ModuleLayer,
  type ModuleStatus,
} from "@/modules/manifest";

const LAYER_ORDER: readonly ModuleLayer[] = [
  "platform",
  "financial-authority",
  "operations",
  "analytical",
];

const LAYER_LABELS: Readonly<Record<ModuleLayer, { label: string; title: string }>> = {
  platform: {
    label: "Platform",
    title: "Identity, tenancy, evidence and control",
  },
  "financial-authority": {
    label: "Financial authority",
    title: "The only writers of authoritative financial state",
  },
  operations: {
    label: "Operations",
    title: "Business processes that request financial consequences",
  },
  analytical: {
    label: "Analytical",
    title: "Derived conclusions; never a write path into the books",
  },
};

const STATUS_LABELS: Readonly<Record<ModuleStatus, string>> = {
  documented: "Documented",
  "in-progress": "In progress",
  implemented: "Implemented",
};

const DOCUMENTS: readonly string[] = [
  "ARCHITECTURE",
  "DOMAIN_MODEL",
  "FINANCIAL_INTEGRITY",
  "SECURITY",
  "DATA_GOVERNANCE",
  "DEVELOPMENT_WORKFLOW",
  "TESTING_STRATEGY",
  "ROADMAP",
  "decisions/",
];

export default function FoundationPage() {
  const byLayer = modulesByLayer();
  const documentedCount = MODULES.filter((module) => module.status === "documented").length;

  return (
    <main className="shell">
      <header className="siteHeader">
        <span className="wordmark">Hestian</span>
        <span className="headerMeta">Milestone 0 · Foundation</span>
      </header>

      <section className="hero">
        <p className="eyebrow">Business operating system</p>
        <h1 className="display">
          The financial record has to be <em>correct</em> before anything is built on it.
        </h1>
        <p className="lede">
          Hestian brings financial core, growth, operations and intelligence into one system for
          independent creators and creator-led businesses. This deployment is the architectural
          foundation: bounded contexts, financial authority boundaries and the rules that keep
          analysis from ever touching the books.
        </p>
        <ul className="factRow">
          <li>
            <span className="factDot" aria-hidden="true" />
            {MODULES.length} bounded contexts
          </li>
          <li>
            <span className="factDot" aria-hidden="true" />
            No financial data
          </li>
          <li>
            <span className="factDot" aria-hidden="true" />
            No authentication
          </li>
          <li>
            <span className="factDot" aria-hidden="true" />
            No live integrations
          </li>
        </ul>
      </section>

      <section aria-labelledby="pillars-title">
        <h2 id="pillars-title" className="sectionNote">
          Product capability
        </h2>
        <div className="pillars">
          {PRODUCT_PILLARS.map((pillar, index) => (
            <article className="pillar" key={pillar.id}>
              <span className="pillarIndex">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="pillarName">{pillar.name}</h3>
              <p className="pillarBody">{pillar.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="modules-title">
        <div className="sectionHead">
          <h2 id="modules-title" className="sectionTitle">
            Module foundation
          </h2>
          <p className="sectionNote">
            {documentedCount} of {MODULES.length} documented
          </p>
        </div>

        {LAYER_ORDER.map((layer) => (
          <div className="layerGrid" key={layer}>
            <p className="layerLabel">
              {LAYER_LABELS[layer].label}
              <strong>{LAYER_LABELS[layer].title}</strong>
            </p>
            <ul className="moduleList">
              {byLayer[layer].map((module) => (
                <li className="moduleRow" key={module.id}>
                  <span className="moduleName">{module.name}</span>
                  <span className="status">{STATUS_LABELS[module.status]}</span>
                  <p className="moduleSummary">{module.summary}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="notice" aria-labelledby="scope-title">
        <h2 id="scope-title" className="noticeTitle">
          What this deployment is not
        </h2>
        <p className="noticeIntro">
          Nothing here is a simulated product. The following capabilities are deliberately absent
          and will each be introduced by a reviewed milestone, with tests, before any of them is
          described as working.
        </p>
        <ul className="noticeList">
          <li>
            <span aria-hidden="true">—</span>
            <span>No accounting engine, journal, chart of accounts or balances.</span>
          </li>
          <li>
            <span aria-hidden="true">—</span>
            <span>No authentication, sessions or tenant records. Authorization is documented, not built.</span>
          </li>
          <li>
            <span aria-hidden="true">—</span>
            <span>No bank feeds, payment execution, tax filing, payroll or Shopify connection.</span>
          </li>
          <li>
            <span aria-hidden="true">—</span>
            <span>No forecasts, recommendations or model integration of any kind.</span>
          </li>
          <li>
            <span aria-hidden="true">—</span>
            <span>No sample balances, charts or fixtures that could be mistaken for real activity.</span>
          </li>
        </ul>
      </section>

      <footer className="siteFooter">
        <div>
          <span>
            Source of truth:{" "}
            <a href="https://github.com/GraySilverstein/Hestian" rel="noreferrer noopener">
              github.com/GraySilverstein/Hestian
            </a>
          </span>
          <ul className="footerDocs">
            {DOCUMENTS.map((document) => (
              <li key={document}>docs/{document}</li>
            ))}
          </ul>
        </div>
        <span className="footerSignature">Foundation · not for production use</span>
      </footer>
    </main>
  );
}
