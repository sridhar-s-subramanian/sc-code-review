import type { Finding, Report } from "../types.ts";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SEV_COLOR: Record<Finding["severity"], string> = {
  critical: "#ff4444",
  high:     "#ff8c00",
  medium:   "#f0c040",
  low:      "#4488ff",
  info:     "#888888",
};

function badge(severity: Finding["severity"]): string {
  return `<span class="badge" style="background:${SEV_COLOR[severity]}">${severity.toUpperCase()}</span>`;
}

function mdToHtml(md: string): string {
  let inList = false;
  const lines = md.split("\n").map((line) => {
    if (line.startsWith("## "))  { if (inList) { inList = false; return `</ul><h2>${esc(line.slice(3))}</h2>`; } return `<h2>${esc(line.slice(3))}</h2>`; }
    if (line.startsWith("### ")) { if (inList) { inList = false; return `</ul><h3>${esc(line.slice(4))}</h3>`; } return `<h3>${esc(line.slice(4))}</h3>`; }
    if (/^\d+\.\s/.test(line) || line.startsWith("- ")) {
      const text = line.replace(/^\d+\.\s/, "").replace(/^- /, "");
      if (!inList) { inList = true; return `<ul><li>${esc(text)}</li>`; }
      return `<li>${esc(text)}</li>`;
    }
    if (line.trim() === "") {
      if (inList) { inList = false; return "</ul><br>"; }
      return "<br>";
    }
    if (inList) { inList = false; return `</ul><p>${esc(line)}</p>`; }
    return `<p>${esc(line)}</p>`;
  });
  if (inList) lines.push("</ul>");
  return lines.join("\n");
}

function findingsTable(findings: Finding[]): string {
  if (findings.length === 0) return `<p class="empty">No findings in this category.</p>`;
  const rows = findings.map((f) => `
    <tr>
      <td>${badge(f.severity)}</td>
      <td><code class="rule">${esc(f.ruleId)}</code></td>
      <td>${esc(f.title)}</td>
      <td><code class="file">${esc(f.file)}${f.line ? `:${f.line}` : ""}</code></td>
      <td class="tool-cell">${esc(f.tool)}</td>
      <td class="desc-cell">${esc(f.description.slice(0, 250))}</td>
    </tr>`).join("");
  return `
  <table class="findings">
    <thead><tr><th>Severity</th><th>Rule ID</th><th>Title</th><th>Location</th><th>Tool</th><th>Description</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function generateHtmlReport(report: Report): string {
  const { scan, analysis } = report;
  const ts = report.generatedAt.toLocaleString();

  const riskColor =
    analysis.riskScore >= 8 ? SEV_COLOR.critical :
    analysis.riskScore >= 6 ? SEV_COLOR.high :
    analysis.riskScore >= 4 ? SEV_COLOR.medium : SEV_COLOR.low;

  const toolRows = scan.toolResults.map((tr) => {
    const status = tr.skipped
      ? `<span style="color:#e3b341">SKIPPED</span>`
      : tr.error
        ? `<span style="color:#f85149">ERROR</span>`
        : `<span style="color:#3fb950">${tr.findings.length} findings</span>`;
    return `<tr><td>${esc(tr.tool)}</td><td>${status}</td><td>${tr.durationMs}ms</td></tr>`;
  }).join("");

  const severities: Finding["severity"][] = ["critical", "high", "medium", "low", "info"];
  const bySeverity = severities
    .map((sev) => ({ sev, items: scan.allFindings.filter((f) => f.severity === sev) }))
    .filter((g) => g.items.length > 0);

  const navLinks = bySeverity.map(({ sev, items }) =>
    `<a href="#sev-${sev}">${badge(sev)} <span>${items.length}</span></a>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Careem Security Report</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d1117;--surface:#161b22;--surface2:#1c2128;--border:#30363d;
  --text:#c9d1d9;--muted:#8b949e;--accent:#58a6ff;--green:#3fb950;
  --mono:"SF Mono","Fira Code",Consolas,monospace;
  --font:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
body{background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;line-height:1.6;min-height:100vh}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:var(--mono);background:var(--surface2);padding:1px 5px;border-radius:3px;font-size:12px}
h1{font-size:22px;font-weight:700;color:#f0f6fc}
h2{font-size:16px;font-weight:700;color:#f0f6fc;margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
h3{font-size:13px;font-weight:600;color:var(--muted);margin:14px 0 6px;text-transform:uppercase;letter-spacing:.06em}
p{margin:6px 0;color:var(--text)}
ul{padding-left:20px;margin:6px 0}
li{margin:4px 0}

/* layout */
.layout{display:grid;grid-template-columns:220px 1fr;min-height:100vh}
.sidebar{background:var(--surface);border-right:1px solid var(--border);padding:24px 16px;position:sticky;top:0;height:100vh;overflow-y:auto}
.sidebar-title{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px}
.sidebar nav{display:flex;flex-direction:column;gap:8px}
.sidebar nav a{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;font-size:13px;color:var(--text)}
.sidebar nav a:hover{background:var(--surface2);text-decoration:none}
.sidebar nav a span{color:var(--muted);font-size:12px;margin-left:auto}
.sidebar-section{margin-top:24px;padding-top:16px;border-top:1px solid var(--border)}
.content{padding:32px 40px;max-width:1200px}

/* risk card */
.risk-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:24px;margin-bottom:24px;display:flex;gap:24px;align-items:flex-start}
.risk-score{font-size:52px;font-weight:800;line-height:1;letter-spacing:-2px}
.risk-info{flex:1}
.risk-label{font-size:20px;font-weight:700;color:#f0f6fc;margin-bottom:4px}
.risk-sub{font-size:13px;color:var(--muted)}
.tool-table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
.tool-table td{padding:5px 12px;border-bottom:1px solid var(--border)}
.tool-table tr:last-child td{border-bottom:none}
.tool-table td:first-child{font-weight:600;color:#f0f6fc}

/* ai section */
.ai-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:24px;margin-bottom:24px;font-size:13px;line-height:1.7}
.ai-card h2{font-size:15px;margin-top:18px}
.ai-card h2:first-child{margin-top:0}
.ai-card code{color:var(--accent)}

/* findings */
.sev-section{margin-bottom:32px}
.sev-title{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.findings{width:100%;border-collapse:collapse;font-size:12px}
.findings th{background:var(--surface);color:var(--muted);text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);font-weight:600;white-space:nowrap}
.findings td{padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:top}
.findings tr:hover td{background:rgba(255,255,255,.025)}
code.rule{color:#d2a8ff;font-size:11px}
code.file{color:var(--accent);font-size:11px}
.tool-cell{color:var(--accent);font-family:var(--mono);font-size:11px}
.desc-cell{color:var(--muted);max-width:320px;font-size:12px}
.empty{color:var(--muted);font-style:italic;padding:8px 0}

/* badges */
.badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;color:#0d1117;white-space:nowrap}

/* footer */
.footer{color:var(--muted);font-size:11px;text-align:center;padding:32px 0 16px;border-top:1px solid var(--border);margin-top:40px}
</style>
</head>
<body>
<div class="layout">

<aside class="sidebar">
  <div class="sidebar-title">Careem Security</div>
  <nav>
    <a href="#overview">Overview</a>
    <a href="#ai-analysis">AI Analysis</a>
    <a href="#findings">Findings</a>
    ${navLinks}
  </nav>
  <div class="sidebar-section">
    <div style="font-size:11px;color:var(--muted);line-height:1.5">
      <div><strong style="color:var(--text)">Directory</strong></div>
      <code style="font-size:10px;word-break:break-all">${esc(scan.directory)}</code>
      <div style="margin-top:8px"><strong style="color:var(--text)">Generated</strong></div>
      <div>${esc(ts)}</div>
    </div>
  </div>
</aside>

<main class="content">
  <div style="margin-bottom:24px">
    <h1>Security Report</h1>
    <p style="color:var(--muted);margin-top:4px">SAST analysis powered by Semgrep · Bearer · Trivy · Claude Opus</p>
  </div>

  <!-- Risk Card -->
  <div id="overview" class="risk-card">
    <div class="risk-score" style="color:${riskColor}">${analysis.riskScore}<span style="font-size:24px;opacity:.5">/10</span></div>
    <div class="risk-info">
      <div class="risk-label">${esc(analysis.riskLabel)} Risk</div>
      <div class="risk-sub">${scan.allFindings.length} findings · ${scan.toolResults.filter((t) => !t.skipped).length} tools run · ${scan.startedAt.toLocaleString()}</div>
      <table class="tool-table">
        ${toolRows}
      </table>
    </div>
  </div>

  <!-- AI Analysis -->
  <div id="ai-analysis">
    <h2>AI Security Analysis</h2>
    <div class="ai-card">
      ${mdToHtml(analysis.rawMarkdown)}
    </div>
  </div>

  <!-- Findings -->
  <div id="findings">
    <h2>Findings by Severity</h2>
    ${bySeverity.map(({ sev, items }) => `
    <div id="sev-${sev}" class="sev-section">
      <div class="sev-title">
        ${badge(sev)}
        <span style="font-size:13px;color:var(--muted)">${items.length} finding${items.length !== 1 ? "s" : ""}</span>
      </div>
      ${findingsTable(items)}
    </div>`).join("")}
    ${bySeverity.length === 0 ? `<p class="empty">No findings — the directory looks clean.</p>` : ""}
  </div>

  <div class="footer">Generated by sc-code-review CLI &nbsp;·&nbsp; Powered by Claude Opus</div>
</main>

</div>
</body>
</html>`;
}

export async function writeHtmlReport(report: Report): Promise<string> {
  const ts = report.generatedAt.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `sc-code-review-report-${ts}.html`;
  await Bun.write(filename, generateHtmlReport(report));
  return filename;
}
