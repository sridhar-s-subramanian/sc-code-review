import { runSemgrep } from "./semgrep.ts";
import { runBearer } from "./bearer.ts";
import { runTrivy } from "./trivy.ts";
import type { Config, Finding, ScanResult, ToolName, ToolResult } from "../types.ts";

const SEVERITY_ORDER: Record<Finding["severity"], number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};

export async function runAllScanners(
  dir: string,
  config: Config,
  requestedTools: ToolName[],
): Promise<ScanResult> {
  const startedAt = new Date();

  const runners: Array<() => Promise<ToolResult>> = [];

  if (requestedTools.includes("semgrep") && config.tools.semgrep) {
    runners.push(() => runSemgrep(dir));
  } else if (requestedTools.includes("semgrep")) {
    runners.push(async () => ({
      tool: "semgrep" as ToolName, findings: [], error: null,
      skipped: true, durationMs: 0,
    }));
  }

  if (requestedTools.includes("bearer") && config.tools.bearer) {
    runners.push(() => runBearer(dir));
  } else if (requestedTools.includes("bearer")) {
    runners.push(async () => ({
      tool: "bearer" as ToolName, findings: [], error: null,
      skipped: true, durationMs: 0,
    }));
  }

  if (requestedTools.includes("trivy") && config.tools.trivy) {
    runners.push(() => runTrivy(dir));
  } else if (requestedTools.includes("trivy")) {
    runners.push(async () => ({
      tool: "trivy" as ToolName, findings: [], error: null,
      skipped: true, durationMs: 0,
    }));
  }

  const toolResults = await Promise.all(runners.map((fn) => fn()));

  const allFindings = toolResults
    .flatMap((r) => r.findings)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return { directory: dir, startedAt, toolResults, allFindings };
}
