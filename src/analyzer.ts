import { streamText as streamAnthropic } from "./providers/anthropic.ts";
import { streamText as streamOpenAI }    from "./providers/openai.ts";
import { streamText as streamGoogle }    from "./providers/google.ts";
import { streamText as streamGrok }      from "./providers/grok.ts";
import type { AiAnalysis, Config, Finding, ScanResult } from "./types.ts";

const SYSTEM_PROMPT = `You are an expert application security engineer. You have received findings from multiple automated SAST tools and must synthesize them into a concise, actionable security report.

Respond with EXACTLY this structure (use these exact headers):

## Risk Score: X/10
One sentence overall risk assessment.

## Critical Issues Summary
2-4 sentences on the most severe security problems. Reference specific files or rule IDs. If no critical/high findings exist, say so.

## Cross-Tool Pattern Analysis
Identify themes across tools or files. What does the combination reveal that a single tool alone would miss? Are there systemic issues?

## Prioritized Remediation Plan
1. **[Severity] Title** — Specific fix. Estimated effort: low/medium/high.
2. ...
(Top 5-8 items, most critical first. Be concrete — name files and rule IDs.)`;

function buildPrompt(scan: ScanResult): string {
  const bySeverity: Record<string, number> = {};
  for (const f of scan.allFindings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
  }

  const byTool: Record<string, unknown> = {};
  for (const tr of scan.toolResults) {
    byTool[tr.tool] = {
      findings: tr.findings.length,
      skipped: tr.skipped,
      ...(tr.error ? { error: tr.error } : {}),
    };
  }

  const summary = {
    directory: scan.directory,
    totalFindings: scan.allFindings.length,
    bySeverity,
    byTool,
  };

  const topFindings = scan.allFindings.slice(0, 100).map((f: Finding) => ({
    tool: f.tool,
    severity: f.severity,
    ruleId: f.ruleId,
    title: f.title,
    file: f.file,
    line: f.line,
    description: f.description.slice(0, 300),
  }));

  return `Scan summary:\n${JSON.stringify(summary, null, 2)}\n\nFindings (up to 100):\n${JSON.stringify(topFindings, null, 2)}`;
}

function parseResponse(markdown: string): AiAnalysis {
  const scoreMatch = markdown.match(/##\s*Risk Score:\s*(\d+)\/10/);
  const riskScore = scoreMatch ? parseInt(scoreMatch[1]!, 10) : 5;
  const riskLabel =
    riskScore >= 9 ? "Critical" :
    riskScore >= 7 ? "High" :
    riskScore >= 5 ? "Medium" : "Low";

  const sections = markdown.split(/^##\s+/m);
  const criticalSection    = sections.find((s) => s.startsWith("Critical Issues")) ?? "";
  const patternsSection    = sections.find((s) => s.startsWith("Cross-Tool")) ?? "";
  const remediationSection = sections.find((s) => s.startsWith("Prioritized")) ?? "";

  const remediationPlan = [...remediationSection.matchAll(/^\d+\.\s+(.+)$/gm)]
    .map((m) => m[1] ?? "")
    .filter(Boolean);

  return {
    riskScore,
    riskLabel,
    criticalSummary:   criticalSection.replace(/^Critical Issues Summary\s*/i, "").trim(),
    crossToolPatterns: patternsSection.replace(/^Cross-Tool Pattern Analysis\s*/i, "").trim(),
    remediationPlan,
    rawMarkdown: markdown,
  };
}

export async function analyze(
  scan: ScanResult,
  config: Config,
  onChunk: (text: string) => void,
): Promise<AiAnalysis> {
  const userPrompt = buildPrompt(scan);
  let fullText: string;

  if (config.provider === "anthropic") {
    fullText = await streamAnthropic(config.apiKey, config.model, SYSTEM_PROMPT, userPrompt, onChunk);
  } else if (config.provider === "openai") {
    fullText = await streamOpenAI(config.apiKey, config.model, SYSTEM_PROMPT, userPrompt, onChunk);
  } else if (config.provider === "google") {
    fullText = await streamGoogle(config.apiKey, config.model, SYSTEM_PROMPT, userPrompt, onChunk);
  } else {
    fullText = await streamGrok(config.apiKey, config.model, SYSTEM_PROMPT, userPrompt, onChunk);
  }

  return parseResponse(fullText);
}
