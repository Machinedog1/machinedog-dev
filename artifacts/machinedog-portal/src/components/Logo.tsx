import { Link } from "wouter";
import { cn } from "@/lib/utils";
import huskyMark from "@assets/F4E50D9E-68CC-4514-8AE0-56D611828FC6_1777254862515.png";

type LogoSize = "sm" | "md" | "lg";

interface LogoProps {
  size?: LogoSize;
  showWordmark?: boolean;
  href?: string | null;
  className?: string;
  wordmarkClassName?: string;
}

const SIZE_MAP: Record<LogoSize, { mark: string; text: string; gap: string }> = {
  sm: { mark: "h-8 w-8", text: "text-sm", gap: "gap-2" },
  md: { mark: "h-10 w-10", text: "text-base", gap: "gap-3" },
  lg: { mark: "h-14 w-14", text: "text-xl", gap: "gap-3" },
};

export function Logo({
  size = "md",
  showWordmark = true,
  href = "/",
  className,
  wordmarkClassName,
}: LogoProps) {
  const dims = SIZE_MAP[size];

  const inner = (
    <span className={cn("flex items-center", dims.gap, className)}>
      <span
        className={cn(
          "rounded-full overflow-hidden border-2 border-[hsl(var(--primary))] bg-[hsl(220,40%,4%)] flex items-center justify-center shrink-0",
          dims.mark,
        )}
        style={{
          boxShadow:
            "0 0 0 1px hsla(200,90%,60%,0.45), 0 0 18px hsla(200,90%,60%,0.45)",
        }}
      >
        <img
          src={huskyMark}
          alt="Machinedog husky logo"
          className="h-full w-full object-cover"
          style={{ objectPosition: "50% 22%" }}
        />
      </span>
      {showWordmark && (
        <span
          className={cn(
            "font-extrabold text-foreground whitespace-nowrap",
            dims.text,
            wordmarkClassName,
          )}
          style={{ letterSpacing: "0.16em" }}
        >
          MACHINEDOG<span className="text-primary">.DEV</span>
        </span>
      )}
    </span>
  );

  if (!href) return inner;

  return (
    <Link href={href} className="inline-flex items-center" aria-label="Machinedog.Dev home">
      {inner}
    </Link>
  );
}
