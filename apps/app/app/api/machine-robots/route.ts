import { machineHostRobots } from "@/lib/agents/robots-rules";

// robots.txt for api.qrdx.dev and mcp.qrdx.dev: next.config.ts rewrites
// their /robots.txt here (qrdx.dev's own is app/robots.ts).
export const dynamic = "force-static";

export function GET() {
  return new Response(machineHostRobots(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
