import { SignIn } from "@clerk/react";
import { Logo } from "@/components/Logo";
import { glassClerkAppearance } from "@/lib/clerkAppearance";

export default function SignInPage() {
  const signUpHref = `${import.meta.env.BASE_URL}sign-up`.replace(/\/+/g, "/");

  return (
    <div
      className="dark relative min-h-screen w-full overflow-hidden text-white flex flex-col"
      style={{ background: "hsl(220 45% 3%)" }}
    >
      {/* Vivid gradient blobs make the frosted-glass card actually read.
          A glass card on a flat color is just a flat card. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute top-[10%] left-[15%] h-[640px] w-[640px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, hsl(200 100% 60% / 0.95), transparent 70%)",
            filter: "blur(30px)",
          }}
        />
        <div
          className="absolute top-[40%] right-[8%] h-[680px] w-[680px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, hsl(280 95% 65% / 0.9), transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute -bottom-32 left-[35%] h-[560px] w-[560px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, hsl(330 95% 65% / 0.85), transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute top-0 right-1/4 h-[420px] w-[420px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, hsl(180 90% 60% / 0.6), transparent 70%)",
            filter: "blur(30px)",
          }}
        />
        {/* Subtle film grain so the gradient doesn't look like a phone wallpaper */}
        <div
          className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          }}
        />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 lg:px-12 pt-5 sm:pt-7">
        <Logo size="sm" />
        <a
          href={signUpHref}
          className="hidden sm:inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold tracking-wider uppercase text-white/80 transition hover:text-white"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
          }}
        >
          Sign up <span aria-hidden>→</span>
        </a>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-5 sm:px-8 lg:px-12 py-10">
        <SignIn
          routing="path"
          path={`${import.meta.env.BASE_URL}sign-in`.replace(/\/+/g, "/").replace(/\/$/, "")}
          signUpUrl={`${import.meta.env.BASE_URL}sign-up`.replace(/\/+/g, "/")}
          fallbackRedirectUrl={import.meta.env.BASE_URL}
          appearance={glassClerkAppearance}
        />
      </main>
    </div>
  );
}
