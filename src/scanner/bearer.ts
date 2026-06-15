import type { Finding, Severity, ToolResult } from "../types.ts";

const SEVERITY_MAP: Record<string, Severity> = {
  critical: "critical",
  high:     "high",
  medium:   "medium",
  low:      "low",
  warning:  "info",
};

interface BearerFinding {
  rule_id: string;
  title: string;
  description?: string;
  filename: string;
  line_number?: number;
}

type BearerOutput = Partial<Record<string, BearerFinding[]>>;

export async function runBearer(dir: string): Promise<ToolResult> {
  const start = Date.now();
  try {
    // --exit-code=0 forces exit 0 regardless of findings found
    const result = await Bun.$`bearer scan --format json --exit-code=0 ${dir}`.quiet().nothrow();

    if (result.exitCode >= 2) {
      return {
        tool: "bearer", findings: [], skipped: false,
        error: `bearer exited ${result.exitCode}: ${result.stderr.toString().slice(0, 200)}`,
        durationMs: Date.now() - start,
      };
    }

    const raw = result.stdout.toString().trim();
    if (!raw) {
      return { tool: "bearer", findings: [], error: null, skipped: false, durationMs: Date.now() - start };
    }

    const output = JSON.parse(raw) as BearerOutput;
    const findings: Finding[] = [];

    for (const [key, items] of Object.entries(output)) {
      const severity = SEVERITY_MAP[key] ?? "info";
      for (const item of items ?? []) {
        findings.push({
          tool: "bearer",
          severity,
          title: item.title,
          description: item.description ?? item.title,
          file: item.filename,
          line: item.line_number ?? null,
          ruleId: item.rule_id,
        });
      }
    }

    return { tool: "bearer", findings, error: null, skipped: false, durationMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const notInstalled = msg.includes("not found") || msg.includes("No such file");
    return {
      tool: "bearer", findings: [],
      error: notInstalled ? null : msg,
      skipped: notInstalled,
      durationMs: Date.now() - start,
    };
  }
}
