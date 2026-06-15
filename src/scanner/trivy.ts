import type { Finding, Severity, ToolResult } from "../types.ts";

function mapSeverity(s: string): Severity {
  switch (s.toUpperCase()) {
    case "CRITICAL": return "critical";
    case "HIGH":     return "high";
    case "MEDIUM":   return "medium";
    case "LOW":      return "low";
    default:         return "info";
  }
}

interface TrivyVuln {
  VulnerabilityID: string;
  PkgName: string;
  Title?: string;
  Description?: string;
  Severity: string;
}

interface TrivyResult {
  Target: string;
  Vulnerabilities?: TrivyVuln[];
}

interface TrivyOutput {
  Results?: TrivyResult[];
}

export async function runTrivy(dir: string): Promise<ToolResult> {
  const start = Date.now();
  try {
    const result = await Bun.$`trivy fs --format json --quiet ${dir}`.quiet().nothrow();

    if (result.exitCode >= 2) {
      return {
        tool: "trivy", findings: [], skipped: false,
        error: `trivy exited ${result.exitCode}: ${result.stderr.toString().slice(0, 200)}`,
        durationMs: Date.now() - start,
      };
    }

    const raw = result.stdout.toString().trim();
    if (!raw) {
      return { tool: "trivy", findings: [], error: null, skipped: false, durationMs: Date.now() - start };
    }

    const output = JSON.parse(raw) as TrivyOutput;
    const findings: Finding[] = [];

    for (const r of output.Results ?? []) {
      for (const v of r.Vulnerabilities ?? []) {
        findings.push({
          tool: "trivy",
          severity: mapSeverity(v.Severity),
          title: v.Title ?? v.VulnerabilityID,
          description: v.Description ?? `${v.PkgName}: ${v.VulnerabilityID}`,
          file: r.Target,
          line: null,
          ruleId: v.VulnerabilityID,
        });
      }
    }

    return { tool: "trivy", findings, error: null, skipped: false, durationMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const notInstalled = msg.includes("not found") || msg.includes("No such file");
    return {
      tool: "trivy", findings: [],
      error: notInstalled ? null : msg,
      skipped: notInstalled,
      durationMs: Date.now() - start,
    };
  }
}
