export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type ToolName = "semgrep" | "bearer" | "trivy";
export type OutputFormat = "html" | "json" | "both";
export type AiProvider = "anthropic" | "openai" | "google" | "xai";

export interface Finding {
  tool: ToolName;
  severity: Severity;
  title: string;
  description: string;
  file: string;
  line: number | null;
  ruleId: string;
}

export interface ToolResult {
  tool: ToolName;
  findings: Finding[];
  error: string | null;
  skipped: boolean;
  durationMs: number;
}

export interface ScanResult {
  directory: string;
  startedAt: Date;
  toolResults: ToolResult[];
  allFindings: Finding[];
}

export interface AiAnalysis {
  riskScore: number;
  riskLabel: string;
  criticalSummary: string;
  crossToolPatterns: string;
  remediationPlan: string[];
  rawMarkdown: string;
}

export interface Report {
  scan: ScanResult;
  analysis: AiAnalysis;
  generatedAt: Date;
}

export interface Config {
  provider: AiProvider;
  model: string;
  apiKey: string;
  tools: {
    semgrep: boolean;
    bearer: boolean;
    trivy: boolean;
  };
}

export interface ScanOptions {
  directory: string;
  outputFormat: OutputFormat;
  tools: ToolName[];
}
