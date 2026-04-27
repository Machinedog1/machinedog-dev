import { Logo } from "@/components/Logo";
import huskyPortrait from "@assets/F4E50D9E-68CC-4514-8AE0-56D611828FC6_1777252211433.png";

type Project = {
  domain: string;
  monogram: string;
  tagline: string;
  description: string;
  href: string;
  tags: string[];
  gradient: string;
};

const PROJECTS: Project[] = [
  {
    domain: "beesuite.farm",
    monogram: "B",
    tagline: "Operations platform for working apiaries",
    description:
      "Hive-by-hive inspections, queen lineage, harvest yield, and treatment schedules in one calm dashboard. Built for beekeepers who actually wear veils.",
    href: "https://beesuite.farm",
    tags: ["Operations", "IoT", "Mobile-first"],
    gradient:
      "linear-gradient(135deg, hsl(40 95% 58%) 0%, hsl(28 95% 50%) 60%, hsl(14 90% 42%) 100%)",
  },
  {
    domain: "lawn.health",
    monogram: "L",
    tagline: "Diagnose and treat your lawn with confidence",
    description:
      "Snap a photo, get a soil-aware health score, a fix-it plan, and a 12-week treatment calendar. No more guessing if it's grub damage or drought stress.",
    href: "https://lawn.health",
    tags: ["AI Vision", "Consumer", "Geo-aware"],
    gradient:
      "linear-gradient(135deg, hsl(150 80% 50%) 0%, hsl(170 80% 42%) 60%, hsl(195 85% 40%) 100%)",
  },
  {
    domain: "farmstand.market",
    monogram: "F",
    tagline: "Farm-to-table, without the middlemen",
    description:
      "A direct marketplace where small farms list weekly stock and shoppers reserve pickup or local delivery. Transparent pricing, fair payouts, no broker cuts.",
    href: "https://farmstand.market",
    tags: ["Marketplace", "Payments", "Logistics"],
    gradient:
      "linear-gradient(135deg, hsl(254 90% 70%) 0%, hsl(232 85% 60%) 60%, hsl(200 95% 55%) 100%)",
  },
  {
    domain: "enrg.fit",
    monogram: "E",
    tagline: "Train with the energy you actually have today",
    description:
      "An adaptive fitness coach that reads your sleep, HRV, and recovery signals to tune each session. Less burnout, more durable progress, no guilt-driven plans.",
    href: "https://enrg.fit",
    tags: ["Health", "Wearables", "Adaptive AI"],
    gradient:
      "linear-gradient(135deg, hsl(330 90% 62%) 0%, hsl(0 90% 58%) 55%, hsl(28 95% 55%) 100%)",
  },
];

export default function WorkPage() {
  const intakeHref = `${import.meta.env.BASE_URL}intake`.replace(/\/+/g, "/");
  const signInHref = `${import.meta.env.BASE_URL}sign-in`.replace(/\/+/g, "/");

  return (
    <div
      className="dark relative min-h-screen w-full overflow-hidden text-white"
      style={{ background: "hsl(220 45% 3%)" }}
    >
      {/* Husky portrait — fades into background */}
      <div
        className="absolute inset-x-0 top-0 h-[60vh] bg-cover bg-no-repeat bg-[position:50%_28%] opacity-60"
        style={{
          backgroundImage: `url(${huskyPortrait})`,
          filter: "saturate(1.1) contrast(1.05) brightness(0.7)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-[60vh] pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsla(220,45%,3%,0.45) 55%, hsla(220,45%,3%,1) 100%)",
        }}
      />
      {/* Subtle cyan ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 35% at 50% 22%, hsla(200,95%,55%,0.18) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between px-5 sm:px-8 lg:px-12 pt-5 sm:pt-7">
          <Logo size="sm" />
          <nav className="flex items-center gap-2 sm:gap-3">
            <a
              href={intakeHref}
              className="hidden sm:inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold tracking-wider uppercase text-white/80 transition hover:text-white"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.14)",
                backdropFilter: "blur(20px) saturate(180%)",
                WebkitBackdropFilter: "blur(20px) saturate(180%)",
              }}
            >
              Request invite <span aria-hidden>→</span>
            </a>
            <a
              href={signInHref}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold tracking-wider uppercase text-white transition hover:opacity-95"
              style={{
                background:
                  "linear-gradient(135deg, hsl(200 95% 55%) 0%, hsl(254 90% 65%) 100%)",
                boxShadow: "0 8px 24px -8px hsla(200,95%,55%,0.55)",
              }}
            >
              Sign in <span aria-hidden>→</span>
            </a>
          </nav>
        </header>

        {/* Hero / heading */}
        <section className="px-5 sm:px-8 lg:px-12 pt-12 lg:pt-20 pb-10 lg:pb-14 max-w-6xl mx-auto w-full">
          <div
            className="mb-4 text-[11px] sm:text-xs font-mono tracking-[0.28em] uppercase"
            style={{ color: "hsl(200 95% 70%)" }}
          >
            Selected work
          </div>
          <h1
            className="text-white uppercase font-extrabold leading-[0.92] tracking-tight"
            style={{
              fontSize: "clamp(2.25rem, 5.5vw, 4.25rem)",
              textShadow: "0 4px 40px rgba(0,0,0,0.45)",
            }}
          >
            Projects we've
            <br />
            <span
              style={{
                WebkitTextFillColor: "transparent",
                WebkitBackgroundClip: "text",
                backgroundImage:
                  "linear-gradient(135deg, hsl(200 95% 65%) 0%, hsl(254 95% 78%) 100%)",
              }}
            >
              forged
            </span>{" "}
            in the den.
          </h1>
          <p className="mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-white/75">
            A small slice of what comes out of Machinedog.Dev. Each one is
            shipped, in production, and run by humans we respect.
          </p>
        </section>

        {/* Project grid */}
        <section className="px-5 sm:px-8 lg:px-12 pb-16 lg:pb-24 max-w-6xl mx-auto w-full">
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
            {PROJECTS.map((project) => (
              <li key={project.domain}>
                <a
                  href={project.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex h-full flex-col overflow-hidden rounded-[24px] transition hover:-translate-y-0.5"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    backdropFilter: "blur(40px) saturate(180%)",
                    WebkitBackdropFilter: "blur(40px) saturate(180%)",
                    boxShadow:
                      "0 24px 60px -20px rgba(0,0,0,0.55), 0 1px 0 0 rgba(255,255,255,0.16) inset",
                  }}
                >
                  {/* Gradient cover with monogram */}
                  <div
                    className="relative h-32 sm:h-36 w-full overflow-hidden"
                    style={{ background: project.gradient }}
                  >
                    <div
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.35) 0%, transparent 55%)",
                        mixBlendMode: "screen",
                      }}
                    />
                    <div
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.18) 100%)",
                      }}
                    />
                    <span
                      className="absolute left-5 bottom-4 text-white font-extrabold leading-none"
                      style={{
                        fontSize: "5rem",
                        letterSpacing: "-0.04em",
                        textShadow: "0 6px 24px rgba(0,0,0,0.35)",
                      }}
                    >
                      {project.monogram}
                    </span>
                    <span
                      className="absolute right-4 top-4 text-[10px] font-mono uppercase tracking-[0.22em] text-white/85 px-2.5 py-1 rounded-full"
                      style={{
                        background: "rgba(0,0,0,0.28)",
                        backdropFilter: "blur(12px)",
                        border: "1px solid rgba(255,255,255,0.18)",
                      }}
                    >
                      Live
                    </span>
                  </div>

                  {/* Body */}
                  <div className="relative flex flex-1 flex-col p-5 sm:p-6 gap-3">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                        {project.domain}
                      </h2>
                      <p className="mt-1 text-sm text-white/65 font-medium">
                        {project.tagline}
                      </p>
                    </div>

                    <p className="text-sm leading-relaxed text-white/75 flex-1">
                      {project.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {project.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-mono uppercase tracking-[0.18em] px-2 py-1 rounded-md text-white/70"
                          style={{
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.10)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-3 mt-1 border-t border-white/10">
                      <span className="text-xs font-mono uppercase tracking-[0.22em] text-white/55">
                        {project.domain}
                      </span>
                      <span
                        className="text-xs font-semibold text-primary group-hover:text-white transition"
                        style={{ color: "hsl(200 95% 70%)" }}
                      >
                        Visit <span aria-hidden>→</span>
                      </span>
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ul>

          {/* CTA strip */}
          <div
            className="mt-12 lg:mt-16 rounded-[24px] p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 justify-between"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(40px) saturate(180%)",
              WebkitBackdropFilter: "blur(40px) saturate(180%)",
            }}
          >
            <div>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                Have something you want forged?
              </h3>
              <p className="mt-1 text-sm sm:text-base text-white/70">
                Tell us what you're building. We take a small number of new
                projects each quarter.
              </p>
            </div>
            <a
              href={intakeHref}
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold tracking-wide text-white shadow-lg transition hover:opacity-95 shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, hsl(200 95% 55%) 0%, hsl(254 90% 65%) 100%)",
                boxShadow: "0 12px 32px -8px hsla(200,95%,55%,0.55)",
              }}
            >
              Request an invite <span aria-hidden>→</span>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
