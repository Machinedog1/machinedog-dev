import { db, templatesTable, type InsertTemplate } from "@workspace/db";
import { logger } from "./logger";

// 13 starter templates seeded on every API boot. Keep entries idempotent
// (insert ... on conflict do update) so editing a starter file or
// compliance note in source code reliably propagates to dev + prod
// without a manual migration. The starter file sets are intentionally
// small — the AI console (Phase 4) is what fleshes a project out.

function reactPage(title: string, body: string): string {
  return `export default function Page() {
  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">${title}</h1>
      <p className="text-sm leading-6 text-muted-foreground">${body}</p>
    </main>
  );
}
`;
}

const TEMPLATES: InsertTemplate[] = [
  {
    slug: "saas-starter",
    name: "SaaS Starter",
    description:
      "React + Vite + Tailwind shell with auth-ready routes, dashboard layout, and pricing page stub. Good baseline for a subscription product.",
    category: "general",
    framework: "react-vite",
    projectType: "web_app",
    isHealthcare: false,
    tokenCost: 0,
    starterFiles: [
      { path: "README.md", contents: "# SaaS Starter\n\nReact + Vite + Tailwind. Edit `src/App.tsx` to begin." },
      { path: "src/App.tsx", contents: reactPage("Welcome to your SaaS", "Replace this with your product surface. Auth and billing scaffolding live in /lib.") },
      { path: "src/pages/dashboard.tsx", contents: reactPage("Dashboard", "Authenticated landing page.") },
      { path: "src/pages/pricing.tsx", contents: reactPage("Pricing", "Render your tiers here.") },
    ],
    complianceNotes: "",
  },
  {
    slug: "landing-page",
    name: "Landing Page",
    description:
      "Single-page marketing site with hero, features grid, social proof, and CTA. Perfect for early-stage launches.",
    category: "general",
    framework: "react-vite",
    projectType: "web_app",
    isHealthcare: false,
    tokenCost: 0,
    starterFiles: [
      { path: "README.md", contents: "# Landing Page\n\nA single-page marketing site." },
      { path: "src/App.tsx", contents: reactPage("Your product, in one line.", "Hero copy + features grid live here. Update with your brand voice.") },
    ],
    complianceNotes: "",
  },
  {
    slug: "api-starter",
    name: "API Starter",
    description:
      "Express + TypeScript + Drizzle ORM backend with sample REST routes, request validation, and a Postgres connection.",
    category: "general",
    framework: "express",
    projectType: "api",
    isHealthcare: false,
    tokenCost: 0,
    starterFiles: [
      { path: "README.md", contents: "# API Starter\n\nExpress + Drizzle. Run `npm run dev`." },
      {
        path: "src/index.ts",
        contents: `import express from "express";\nconst app = express();\napp.use(express.json());\napp.get("/healthz", (_req, res) => res.json({ status: "ok" }));\napp.listen(process.env.PORT ?? 3000);\n`,
      },
    ],
    complianceNotes: "",
  },
  {
    slug: "admin-dashboard",
    name: "Admin Dashboard",
    description:
      "Sidebar-driven admin shell with tables, filters, and a chart skeleton. Wire it to your data source.",
    category: "general",
    framework: "react-vite",
    projectType: "internal_tool",
    isHealthcare: false,
    tokenCost: 0,
    starterFiles: [
      { path: "README.md", contents: "# Admin Dashboard\n\nSidebar + tables shell." },
      { path: "src/App.tsx", contents: reactPage("Admin", "Replace with your CRUD tables.") },
    ],
    complianceNotes: "",
  },
  {
    slug: "ecommerce-starter",
    name: "E-commerce Starter",
    description:
      "Product grid, cart, and checkout-ready scaffolding. Stripe handoff is wired but inactive until you add keys.",
    category: "general",
    framework: "react-vite",
    projectType: "web_app",
    isHealthcare: false,
    tokenCost: 0,
    starterFiles: [
      { path: "README.md", contents: "# E-commerce Starter\n\nProduct grid + cart shell." },
      { path: "src/App.tsx", contents: reactPage("Storefront", "Add your products and Stripe keys to go live.") },
    ],
    complianceNotes: "",
  },
  {
    slug: "mobile-app-starter",
    name: "Mobile App Starter",
    description:
      "Expo + React Native skeleton with tab navigation. Stub-only for v1 — full mobile workspace lands in a later phase.",
    category: "general",
    framework: "expo",
    projectType: "mobile_app",
    isHealthcare: false,
    tokenCost: 0,
    starterFiles: [
      { path: "README.md", contents: "# Mobile App Starter (stub)\n\nExpo skeleton. Full mobile tooling coming in a later phase." },
      { path: "App.tsx", contents: "import { Text, View } from 'react-native';\nexport default function App() {\n  return <View><Text>Hello mobile.</Text></View>;\n}\n" },
    ],
    complianceNotes: "",
  },
  {
    slug: "internal-tool-starter",
    name: "Internal Tool Starter",
    description:
      "Single-screen internal CRUD tool with form, list, and detail panes. Built for ops teams, not customers.",
    category: "general",
    framework: "react-vite",
    projectType: "internal_tool",
    isHealthcare: false,
    tokenCost: 0,
    starterFiles: [
      { path: "README.md", contents: "# Internal Tool Starter\n\nForm + list + detail." },
      { path: "src/App.tsx", contents: reactPage("Internal Tool", "Replace with your CRUD form.") },
    ],
    complianceNotes: "",
  },

  // ── Healthcare tier ─────────────────────────────────────────────────────
  {
    slug: "hipaa-patient-intake",
    name: "HIPAA-ready Patient Intake",
    description:
      "Patient intake form with HIPAA-aware data handling, consent capture, and audit trail hooks.",
    category: "healthcare",
    framework: "react-vite",
    projectType: "healthcare_template",
    isHealthcare: true,
    tokenCost: 0,
    starterFiles: [
      { path: "README.md", contents: "# Patient Intake (HIPAA-ready)\n\nDo not collect real PHI until your BAA is signed and `phiAllowed` is enabled." },
      { path: "src/App.tsx", contents: reactPage("Patient intake", "All PHI fields are stubbed and disabled until your BAA is active.") },
    ],
    complianceNotes:
      "PHI capture is gated by your organization's BAA status. This template sets healthcareMode=true but phiAllowed remains false until your BAA is signed.",
  },
  {
    slug: "secure-appointment-portal",
    name: "Secure Appointment Request Portal",
    description:
      "Patient-facing appointment request portal with audit logging, secure messaging stub, and provider notifications.",
    category: "healthcare",
    framework: "react-vite",
    projectType: "healthcare_template",
    isHealthcare: true,
    tokenCost: 0,
    starterFiles: [
      { path: "README.md", contents: "# Secure Appointment Portal\n\nPHI-aware appointment requests." },
      { path: "src/App.tsx", contents: reactPage("Request an appointment", "Patient-facing booking flow stub.") },
    ],
    complianceNotes: "Audit logs every form submission. Disable until BAA is active.",
  },
  {
    slug: "referral-tracking-dashboard",
    name: "Referral Tracking Dashboard",
    description:
      "Internal dashboard for tracking inbound and outbound referrals with status timelines and provider directory hooks.",
    category: "healthcare",
    framework: "react-vite",
    projectType: "healthcare_template",
    isHealthcare: true,
    tokenCost: 0,
    starterFiles: [
      { path: "README.md", contents: "# Referral Tracking" },
      { path: "src/App.tsx", contents: reactPage("Referrals", "Track inbound + outbound referrals.") },
    ],
    complianceNotes: "Treat referral metadata as PHI. Access requires a signed BAA.",
  },
  {
    slug: "prior-authorization-workflow",
    name: "Prior Authorization Workflow",
    description:
      "Workflow tool for managing prior auth submissions with payer routing, status tracking, and document attachment.",
    category: "healthcare",
    framework: "react-vite",
    projectType: "healthcare_template",
    isHealthcare: true,
    tokenCost: 0,
    starterFiles: [
      { path: "README.md", contents: "# Prior Authorization" },
      { path: "src/App.tsx", contents: reactPage("Prior Auth", "Submit and track prior authorizations.") },
    ],
    complianceNotes: "Document uploads MUST be encrypted at rest. Disable PHI capture until BAA is active.",
  },
  {
    slug: "provider-admin-dashboard",
    name: "Provider Admin Dashboard",
    description:
      "Admin shell for clinical practice operations: schedules, panels, and staffing roll-ups.",
    category: "healthcare",
    framework: "react-vite",
    projectType: "healthcare_template",
    isHealthcare: true,
    tokenCost: 0,
    starterFiles: [
      { path: "README.md", contents: "# Provider Admin Dashboard" },
      { path: "src/App.tsx", contents: reactPage("Provider Admin", "Practice-ops dashboard stub.") },
    ],
    complianceNotes: "Provider-only. Restrict access via your IdP groups.",
  },
  {
    slug: "healthcare-crm-starter",
    name: "Healthcare CRM Starter",
    description:
      "CRM tailored to healthcare relationships: patient pipeline, outreach logs, and HIPAA-aware notes.",
    category: "healthcare",
    framework: "react-vite",
    projectType: "healthcare_template",
    isHealthcare: true,
    tokenCost: 0,
    starterFiles: [
      { path: "README.md", contents: "# Healthcare CRM" },
      { path: "src/App.tsx", contents: reactPage("Healthcare CRM", "Patient + outreach pipeline.") },
    ],
    complianceNotes: "Contact notes can contain PHI. Audit access and require BAA before enabling.",
  },
];

export async function seedTemplates(): Promise<void> {
  try {
    for (const tpl of TEMPLATES) {
      await db
        .insert(templatesTable)
        .values(tpl)
        .onConflictDoUpdate({
          target: templatesTable.slug,
          set: {
            name: tpl.name,
            description: tpl.description,
            category: tpl.category,
            framework: tpl.framework,
            projectType: tpl.projectType,
            isHealthcare: tpl.isHealthcare,
            tokenCost: tpl.tokenCost,
            starterFiles: tpl.starterFiles,
            complianceNotes: tpl.complianceNotes,
          },
        });
    }
    logger.info({ count: TEMPLATES.length }, "Seeded templates");
  } catch (err) {
    logger.error({ err }, "Failed to seed templates");
  }
}
