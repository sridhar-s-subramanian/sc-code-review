#!/usr/bin/env bun
import { parseArgs } from "util";
import { stat } from "node:fs/promises";
import { runInit } from "./init.ts";
import { loadConfig, configExists } from "./config.ts";
import { runAllScanners } from "./scanner/index.ts";
import { analyze } from "./analyzer.ts";
import { writeHtmlReport } from "./reporter/html.ts";
import {
  printProgress, printSuccess, printError,
  printScanSummary, printFindingsTable,
  printAnalysisHeader, printAnalysisChunk, printAnalysisFooter,
  c, bold, dim,
} from "./reporter/terminal.ts";
import type { OutputFormat, ToolName } from "./types.ts";

async function cmdScan(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: "string", default: "html" },
      tools:  { type: "string", default: "semgrep,bearer,trivy" },
    },
    strict: false,
    allowPositionals: true,
  });

  const dir = positionals[0];
  if (!dir) {
    printError("Usage: sc-code-review scan <directory> [--output html|json|both] [--tools semgrep,bearer,trivy]");
    process.exit(1);
  }

  try {
    const s = await stat(dir);
    if (!s.isDirectory()) {
      printError(`Not a directory: ${dir}`);
      process.exit(1);
    }
  } catch {
    printError(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const outputFormat = (values["output"] ?? "html") as OutputFormat;
  const toolNames = ((values["tools"] ?? "semgrep,bearer,trivy") as string)
    .split(",")
    .map((t) => t.trim()) as ToolName[];

  // Prompt to run init if not configured yet
  if (!(await configExists())) {
    printError("Not set up yet. Run: sc-code-review init");
    process.exit(1);
  }

  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`\n${bold("Careem Security Scan")}\n`);
  printProgress(`Target  ${c("#58a6ff", dir)}`);
  printProgress(`Model   ${c("#58a6ff", config.model)}`);
  printProgress(`Tools   ${toolNames.join(", ")}`);
  console.log();

  const scan = await runAllScanners(dir, config, toolNames);
  printScanSummary(scan);
  printFindingsTable(scan.allFindings);

  printAnalysisHeader();

  let analysis;
  try {
    analysis = await analyze(scan, config, printAnalysisChunk);
  } catch (err) {
    printError(`\nAI analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  printAnalysisFooter();

  const report = { scan, analysis, generatedAt: new Date() };

  if (outputFormat === "html" || outputFormat === "both") {
    const path = await writeHtmlReport(report);
    printSuccess(`HTML report: ${c("#58a6ff", path)}`);
  }

  if (outputFormat === "json" || outputFormat === "both") {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const path = `sc-code-review-report-${ts}.json`;
    await Bun.write(path, JSON.stringify(report, null, 2));
    printSuccess(`JSON report: ${c("#58a6ff", path)}`);
  }

  console.log();
}

function printHelp(): void {
  console.log(`
${bold("sc-code-review")} — AI-powered SAST security analysis

${bold("Commands:")}
  ${c("#58a6ff", "sc-code-review init")}               First-time setup
  ${c("#58a6ff", "sc-code-review scan")} ${dim("<directory>")}    Run security scan

${bold("Scan options:")}
  ${dim("--output")}  html | json | both    Report format  ${dim("(default: html)")}
  ${dim("--tools")}   semgrep,bearer,trivy  Limit tools    ${dim("(default: all)")}

${bold("Examples:")}
  sc-code-review scan ./my-app
  sc-code-review scan ./my-app --output both
  sc-code-review scan ./my-app --tools semgrep,trivy
`);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (command === "init") {
    await runInit();
    return;
  }

  if (command === "scan") {
    await cmdScan(rest);
    return;
  }

  printHelp();
}

main().catch((err) => {
  printError(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
