import type { Finding, ToolResult } from "../types.ts";

function mapSeverity(s: string): Finding["severity"] {
  switch (s.toUpperCase()) {
    case "ERROR":   return "critical";
    case "WARNING": return "high";
    case "INFO":    return "medium";
    default:        return "low";
  }
}

interface SemgrepResult {
  check_id: string;
  path: string;
  start: { line: number };
  extra: { message: string; severity: string };
}

interface SemgrepOutput {
  results: SemgrepResult[];
}

export async function runSemgrep(dir: string): Promise<ToolResult> {
  const start = Date.now();
  try {
    // Exit 0 = no findings, 1 = findings found, ≥2 = error
    const result = await Bun.$`semgrep scan --json --config=auto ${dir}`.quiet().nothrow();

    if (result.exitCode >= 2) {
      return {
        tool: "semgrep", findings: [], skipped: false,
        error: `semgrep exited ${result.exitCode}: ${result.stderr.toString().slice(0, 200)}`,
        durationMs: Date.now() - start,
      };
    }

    const output = JSON.parse(result.stdout.toString()) as SemgrepOutput;
    const findings: Finding[] = (output.results ?? []).map((r) => ({
      tool: "semgrep",
      severity: mapSeverity(r.extra.severity),
      title: r.check_id.split(".").at(-1) ?? r.check_id,
      description: r.extra.message,
      file: r.path,
      line: r.start.line,
      ruleId: r.check_id,
    }));

    return { tool: "semgrep", findings, error: null, skipped: false, durationMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const notInstalled = msg.includes("not found") || msg.includes("No such file");
    return {
      tool: "semgrep", findings: [],
      error: notInstalled ? null : msg,
      skipped: notInstalled,
      durationMs: Date.now() - start,
    };
  }
}
