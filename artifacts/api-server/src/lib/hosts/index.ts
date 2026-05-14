import type { HostAdapter, HostProvider } from "./types";
import { vercelAdapter } from "./vercel";
import { renderAdapter } from "./render";
import { replitAdapter } from "./replit";

export * from "./types";

const REGISTRY: Record<HostProvider, HostAdapter> = {
  vercel: vercelAdapter,
  render: renderAdapter,
  replit: replitAdapter,
};

export function getHostAdapter(provider: HostProvider): HostAdapter {
  return REGISTRY[provider];
}

export const HOST_PROVIDERS: HostProvider[] = ["replit", "vercel", "render"];
