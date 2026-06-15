import type { Finding, ScanResult } from "../types.ts";

const RESET = "\x1b[0m";
const BOLD  = "\x1b[1m";
const DIM   = "\x1b[2m";

export function c(color: string, text: string): string {
  const ansi = Bun.color(color, "ansi") ?? "";
  return ansi ? `${ansi}${text}${RESET}` : text;
}

export function bold(text: string): string {
  return `${BOLD}${text}${RESET}`;
}

export function dim(text: string): string {
  return `${DIM}${text}${RESET}`;
}

const SEVERITY_HEX: Record<Finding["severity"], string> = {
  critical: "#ff3333",
  high:     "#ff8800",
  medium:   "#ffcc00",
  low:      "#4488ff",
  info:     "#aaaaaa",
};

export function severityBadge(s: Finding["severity"]): string {
  const label = s.toUpperCase().padEnd(8);
  const ansi = Bun.color(SEVERITY_HEX[s], "ansi") ?? "";
  return ansi ? `${ansi}${BOLD}${label}${RESET}` : label;
}

export function printProgress(message: string): void {
  process.stdout.write(`${c("#58a6ff", "→")} ${message}\n`);
}

export function printSuccess(message: string): void {
  process.stdout.write(`${c("#3fb950", "✓")} ${message}\n`);
}

export function printError(message: string): void {
  process.stdout.write(`${c("#f85149", "✗")} ${message}\n`);
}

export function printWarning(message: string): void {
  process.stdout.write(`${c("#e3b341", "⚠")} ${message}\n`);
}

export function printScanSummary(scan: ScanResult): void {
  console.log(`\n${bold("Scan Results")} — ${dim(scan.directory)}\n`);

  for (const tr of scan.toolResults) {
    const name = tr.tool.padEnd(10);
    if (tr.skipped) {
      console.log(`  ${dim(name)} ${c("#e3b341", "SKIPPED")} ${dim("(not installed)")}`);
    } else if (tr.error) {
      console.log(`  ${dim(name)} ${c("#f85149", "ERROR")}   ${dim(tr.error.slice(0, 70))}`);
    } else {
      const count = tr.findings.length.toString().padStart(4);
      console.log(`  ${c("#58a6ff", name)} ${c("#3fb950", "OK")}      ${bold(count)} findings  ${dim(`(${tr.durationMs}ms)`)}`);
    }
  }

  const counts: Record<Finding["severity"], number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of scan.allFindings) counts[f.severity]++;

  const parts = (Object.entries(counts) as [Finding["severity"], number][])
    .filter(([, n]) => n > 0)
    .map(([sev, n]) => `${severityBadge(sev)} ${bold(String(n))}`)
    .join("  ");

  console.log(`\n  Total: ${bold(String(scan.allFindings.length))} findings — ${parts}\n`);
}

export function printFindingsTable(findings: Finding[], maxRows = 25): void {
  if (findings.length === 0) {
    console.log(`${c("#3fb950", "  No findings — looks clean!")}\n`);
    return;
  }

  console.log(`${bold("Top Findings")}\n`);

  const shown = findings.slice(0, maxRows);
  for (const f of shown) {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    const title = f.title.slice(0, 38).padEnd(38);
    const tool = f.tool.padEnd(8);
    const fileTrunc = loc.length > 48 ? "…" + loc.slice(-47) : loc.padEnd(48);
    console.log(
      `  ${severityBadge(f.severity)} ${bold(title)} ${c("#58a6ff", tool)} ${dim(fileTrunc)}`
    );
  }

  if (findings.length > maxRows) {
    console.log(`\n  ${dim(`… and ${findings.length - maxRows} more findings in the report`)}`);
  }
  console.log();
}

export function printAnalysisHeader(): void {
  console.log(`\n${bold("AI Security Analysis")} ${dim("(streaming from Claude Opus)")}\n`);
  console.log(dim("─".repeat(64)));
  console.log();
}

export function printAnalysisChunk(text: string): void {
  process.stdout.write(text);
}

export function printAnalysisFooter(): void {
  console.log("\n\n" + dim("─".repeat(64)) + "\n");
}
