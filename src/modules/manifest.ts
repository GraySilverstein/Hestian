/**
 * Hestian module registry.
 *
 * This file is the executable version of docs/ARCHITECTURE.md. It declares the
 * bounded contexts, which layer each one sits in, what each one owns, and which
 * modules it may import. `tests/architecture/boundaries.test.ts` enforces the
 * rules over the real source tree, so the registry is a gate, not a comment.
 *
 * Changing an edge here is an architectural change: update the ADR trail and the
 * architecture document in the same commit.
 */
export const MODULE_IDS = [
  "identity",
  "tenancy",
  "audit",
  "integrations",
  "governance",
  "financial-core",
  "reconciliation",
  "business-operations",
  "growth",
  "commerce-intelligence",
  "intelligence",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

/**
 * Trust layers, from most foundational to most derived.
 *
 * - `platform` proves who is acting and for which tenant, and records what
 *   happened.
 * - `financial-authority` holds the only code allowed to create or change
 *   authoritative financial state.
 * - `operations` runs non-financial business processes and reaches financial
 *   state only through financial-core.
 * - `analytical` derives conclusions. It may read authority data but nothing in
 *   another layer may depend on it, so a forecast can never write to the books.
 */
export type ModuleLayer = "platform" | "financial-authority" | "operations" | "analytical";

/** Product pillar a module belongs to. `Platform` is cross-cutting. */
export type ProductPillar = "Core" | "Growth" | "Operations" | "Intelligence" | "Platform";

/**
 * Implementation status. Milestone 0 establishes structure only, so every
 * module is `documented`. `implemented` must never be claimed before the
 * milestone that delivers behaviour.
 */
export type ModuleStatus = "documented" | "in-progress" | "implemented";

export interface ModuleDescriptor {
  readonly id: ModuleId;
  readonly name: string;
  readonly layer: ModuleLayer;
  readonly pillar: ProductPillar;
  readonly status: ModuleStatus;
  readonly summary: string;
  /** Facts this module is the sole source of truth for. */
  readonly owns: readonly string[];
  /** Adjacent concerns deliberately excluded, to keep contexts small. */
  readonly doesNotOwn: readonly string[];
  /** Modules this one may import. Anything else is a boundary violation. */
  readonly mayDependOn: readonly ModuleId[];
}

export const MODULES: readonly ModuleDescriptor[] = [
  {
    id: "identity",
    name: "Identity",
    layer: "platform",
    pillar: "Platform",
    status: "in-progress",
    summary:
      "Who is acting. Email/password authentication, server-verified sessions, revocation and password reset, with email delivery still unconfigured.",
    owns: ["authenticated subject records", "session lifecycle", "credential references (never raw secrets)"],
    doesNotOwn: ["roles and permissions", "business membership", "business data"],
    mayDependOn: [],
  },
  {
    id: "tenancy",
    name: "Tenancy",
    layer: "platform",
    pillar: "Platform",
    status: "in-progress",
    summary:
      "Which business is being operated, and who may act within it. Server-derived tenant context, role permissions and invitations.",
    owns: ["businesses (tenants)", "memberships", "role assignments", "tenant-scoped access decisions"],
    doesNotOwn: ["authentication", "financial records", "module-specific permissions"],
    mayDependOn: ["identity", "audit"],
  },
  {
    id: "audit",
    name: "Audit",
    layer: "platform",
    pillar: "Platform",
    status: "in-progress",
    summary:
      "Append-only, hash-chained record of consequential actions: who acted, for which tenant, on what, with which outcome.",
    owns: ["audit event log", "action provenance", "actor attribution"],
    doesNotOwn: ["financial state", "authorization decisions", "log-file shipping"],
    mayDependOn: [],
  },
  {
    id: "integrations",
    name: "Integrations",
    layer: "platform",
    pillar: "Platform",
    status: "documented",
    summary:
      "Provider connections and inbound evidence capture: OAuth references, webhook intake, encrypted credential storage.",
    owns: ["provider connection records", "encrypted credential envelopes", "inbound webhook receipts", "idempotency keys for delivery"],
    doesNotOwn: ["accounting interpretation", "provider business logic", "payment execution"],
    mayDependOn: ["tenancy", "audit"],
  },
  {
    id: "governance",
    name: "Governance",
    layer: "platform",
    pillar: "Platform",
    status: "documented",
    summary:
      "Policy and control: accounting period controls, approval policies, retention rules and access reviews.",
    owns: ["period control decisions", "approval policies", "retention policy", "control status reporting"],
    doesNotOwn: ["journal entries", "runtime authorization checks", "payments"],
    mayDependOn: ["identity", "tenancy", "audit"],
  },
  {
    id: "financial-core",
    name: "Financial Core",
    layer: "financial-authority",
    pillar: "Core",
    status: "documented",
    summary:
      "The only code permitted to create authoritative financial state: chart of accounts, double-entry journal, invoices, payments, receivables, payables and cash positions.",
    owns: [
      "chart of accounts",
      "journal entries and posting rules",
      "invoices and credit notes",
      "payments and allocations",
      "receivables, payables and cash balances",
      "accounting periods",
    ],
    doesNotOwn: ["marketing performance", "forecasts", "bank API connectivity", "AI interpretation"],
    mayDependOn: ["tenancy", "audit"],
  },
  {
    id: "reconciliation",
    name: "Reconciliation",
    layer: "financial-authority",
    pillar: "Core",
    status: "documented",
    summary:
      "Matches source evidence to accounting state with verified evidence. Unresolved items stay visibly unresolved.",
    owns: ["match candidates", "reconciliation outcomes", "unresolved item queues", "reconciliation evidence links"],
    doesNotOwn: ["source evidence capture", "journal posting rules", "forecasting"],
    mayDependOn: ["tenancy", "audit", "financial-core"],
  },
  {
    id: "business-operations",
    name: "Business Operations",
    layer: "operations",
    pillar: "Operations",
    status: "documented",
    summary:
      "Teams, contractors, workflows, approvals, project costs and operational delivery for creator-led businesses.",
    owns: ["people and contractor records", "projects and deliverables", "workflow and approval state", "project cost records"],
    doesNotOwn: ["journal entries", "payroll execution", "marketing campaigns"],
    mayDependOn: ["tenancy", "audit", "financial-core"],
  },
  {
    id: "growth",
    name: "Growth",
    layer: "analytical",
    pillar: "Growth",
    status: "documented",
    summary:
      "Talos-derived marketing and commerce intelligence: campaigns, marketing budgets, channel performance and campaign profitability.",
    owns: ["campaign records", "marketing budget plans", "channel performance measurements", "campaign profitability models"],
    doesNotOwn: ["authoritative journal entries", "store checkout", "social publishing", "AI recommendations"],
    mayDependOn: ["tenancy", "audit", "financial-core"],
  },
  {
    id: "commerce-intelligence",
    name: "Commerce Intelligence",
    layer: "analytical",
    pillar: "Growth",
    status: "documented",
    summary:
      "Store-level commercial signals: product and order performance, margin observation and customer value analysis.",
    owns: ["store performance analysis", "product margin observations", "customer value analysis"],
    doesNotOwn: ["commerce platform credentials", "order fulfilment", "journal entries"],
    mayDependOn: ["tenancy", "audit", "growth"],
  },
  {
    id: "intelligence",
    name: "Intelligence",
    layer: "analytical",
    pillar: "Intelligence",
    status: "documented",
    summary:
      "Evidence-grounded analysis and decision support: forecasts, interpretations and recommendations that are advisory only.",
    owns: ["analysis results", "forecasts", "recommendations", "evidence citations"],
    doesNotOwn: ["journal entries", "reconciliation outcomes", "payment execution", "permission decisions"],
    mayDependOn: [
      "tenancy",
      "audit",
      "financial-core",
      "reconciliation",
      "business-operations",
      "growth",
      "commerce-intelligence",
    ],
  },
];

export interface ProductPillarDescriptor {
  readonly id: ProductPillar;
  readonly name: string;
  readonly description: string;
}

export const PRODUCT_PILLARS: readonly ProductPillarDescriptor[] = [
  {
    id: "Core",
    name: "Hestian Core",
    description:
      "Financial integrity, accounting foundations, revenue and expenses, invoices, receivables, payables, reconciliation and cash flow.",
  },
  {
    id: "Growth",
    name: "Hestian Growth",
    description:
      "Talos-derived marketing and commerce intelligence: campaigns, budgets, channel performance, store intelligence and campaign profitability.",
  },
  {
    id: "Operations",
    name: "Hestian Operations",
    description:
      "Teams, contractors, workflows, project costs, approvals and operational management.",
  },
  {
    id: "Intelligence",
    name: "Hestian Intelligence",
    description:
      "Business analysis, evidence-grounded recommendations, financial forecasting and decision support.",
  },
];

export function getModule(id: ModuleId): ModuleDescriptor {
  const found = MODULES.find((module) => module.id === id);
  if (found === undefined) {
    throw new Error(`Unknown module id: ${id}`);
  }
  return found;
}

export function modulesByLayer(): Readonly<Record<ModuleLayer, readonly ModuleDescriptor[]>> {
  return {
    platform: MODULES.filter((module) => module.layer === "platform"),
    "financial-authority": MODULES.filter((module) => module.layer === "financial-authority"),
    operations: MODULES.filter((module) => module.layer === "operations"),
    analytical: MODULES.filter((module) => module.layer === "analytical"),
  };
}

export interface DependencyEdge {
  readonly from: ModuleId;
  readonly to: ModuleId;
}

export function dependencyEdges(): readonly DependencyEdge[] {
  return MODULES.flatMap((module) =>
    module.mayDependOn.map((dependency) => ({ from: module.id, to: dependency })),
  );
}

/**
 * Analyses are implementation detail; nothing else may import them.
 *
 * This single predicate is what keeps forecasting and recommendations from
 * becoming a back door into accounting state.
 */
export function isImportAllowed(importer: ModuleId, dependency: ModuleId): boolean {
  if (importer === dependency) return true;
  return getModule(importer).mayDependOn.includes(dependency);
}

/** Returns every dependency cycle in the declared graph, if any. */
export function findDependencyCycles(): readonly (readonly ModuleId[])[] {
  const state = new Map<ModuleId, "visiting" | "visited">();
  const stack: ModuleId[] = [];
  const cycles: ModuleId[][] = [];

  function visit(id: ModuleId): void {
    const current = state.get(id);
    if (current === "visited") return;
    if (current === "visiting") {
      const start = stack.indexOf(id);
      if (start >= 0) cycles.push(stack.slice(start));
      return;
    }

    state.set(id, "visiting");
    stack.push(id);
    for (const dependency of getModule(id).mayDependOn) {
      visit(dependency);
    }
    stack.pop();
    state.set(id, "visited");
  }

  for (const id of MODULE_IDS) {
    visit(id);
  }

  return cycles;
}
