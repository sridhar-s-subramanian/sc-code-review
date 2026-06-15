import { createInterface } from "node:readline";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { saveConfig } from "./config.ts";
import { c, bold, dim, printSuccess, printWarning, printError } from "./reporter/terminal.ts";
import type { AiProvider, Config, ToolName } from "./types.ts";

// ── Provider / model catalogue ────────────────────────────────────────────────

interface ModelOption {
  id: string;
  label: string;
  description: string;
  price: string;
}

interface ProviderKeyConfig {
  envVar: string;
  keyUrl: string;
  label: string;
  prefix: string | null;
}

interface ProviderOption {
  id: AiProvider;
  label: string;
  tagline: string;
  models: ModelOption[];
  keyConfig: ProviderKeyConfig;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    tagline: "Claude models — industry-leading reasoning & code analysis",
    keyConfig: {
      envVar: "ANTHROPIC_API_KEY",
      keyUrl: "https://console.anthropic.com/settings/keys",
      label: "Anthropic API key",
      prefix: "sk-ant-",
    },
    models: [
      { id: "claude-opus-4-8",  label: "Claude Opus 4.8",  description: "Most capable — deepest analysis, best findings",  price: "$5 / 1M tokens" },
      { id: "claude-sonnet-4-6",label: "Claude Sonnet 4.6",description: "Balanced — great quality at 3× lower cost",        price: "$3 / 1M tokens" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", description: "Fastest — lightweight scans & quick feedback",      price: "$1 / 1M tokens" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    tagline: "GPT-4o and o-series reasoning models",
    keyConfig: {
      envVar: "OPENAI_API_KEY",
      keyUrl: "https://platform.openai.com/api-keys",
      label: "OpenAI API key",
      prefix: "sk-",
    },
    models: [
      { id: "gpt-4o",      label: "GPT-4o",      description: "Most capable GPT — best for complex security analysis", price: "$2.50 / 1M tokens" },
      { id: "gpt-4o-mini", label: "GPT-4o mini", description: "Fast & affordable — great for smaller codebases",       price: "$0.15 / 1M tokens" },
      { id: "o4-mini",     label: "o4-mini",      description: "Reasoning model — deep analysis with chain of thought", price: "$1.10 / 1M tokens" },
    ],
  },
  {
    id: "google",
    label: "Google Gemini",
    tagline: "Gemini 2.5 models with 1M context window",
    keyConfig: {
      envVar: "GEMINI_API_KEY",
      keyUrl: "https://aistudio.google.com/apikey",
      label: "Gemini API key",
      prefix: null,
    },
    models: [
      { id: "gemini-2.5-pro",   label: "Gemini 2.5 Pro",   description: "Most capable Gemini — advanced reasoning",    price: "$1.25 / 1M tokens" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Fast & cost-efficient — large-scale analysis", price: "$0.30 / 1M tokens" },
    ],
  },
];

// ── Interactive helpers ───────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function askSecret(label: string): Promise<string> {
  process.stdout.write(label);

  type RlInternal = { stdoutMuted: boolean; _writeToOutput(s: string): void };
  const internal = rl as unknown as RlInternal;
  internal.stdoutMuted = true;
  const origWrite = internal._writeToOutput.bind(rl);
  internal._writeToOutput = function (str: string) {
    if (internal.stdoutMuted) {
      if (str === "\r\n" || str === "\n") process.stdout.write("\n");
      else if (str) process.stdout.write("*");
    } else {
      origWrite(str);
    }
  };

  const answer = await new Promise<string>((resolve) => {
    rl.question("", (a) => resolve(a.trim()));
  });

  internal.stdoutMuted = false;
  internal._writeToOutput = origWrite;
  return answer;
}

async function selectFromMenu<T>(
  items: Array<{ label: string; meta: string; value: T }>,
  defaultIdx = 0,
): Promise<T> {
  const pad = String(items.length).length;
  items.forEach((item, i) => {
    const num    = c("#58a6ff", `  ${String(i + 1).padStart(pad)}.`);
    const lbl    = bold(item.label.padEnd(24));
    const meta   = dim(item.meta);
    const marker = i === defaultIdx ? c("#3fb950", " ◀ default") : "";
    console.log(`${num} ${lbl} ${meta}${marker}`);
  });
  console.log();

  const raw = await ask(`Choice [${defaultIdx + 1}]: `);
  const idx = raw === "" ? defaultIdx : parseInt(raw, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= items.length) {
    printError("Invalid selection.");
    process.exit(1);
  }
  return items[idx]!.value;
}

// ── SAST tool installation ────────────────────────────────────────────────────

interface InstallPlan { method: string; cmd: string[] }

async function hasBin(name: string): Promise<boolean> {
  const r = await Bun.$`which ${name}`.quiet().nothrow();
  return r.exitCode === 0;
}

async function getInstallPlan(tool: ToolName): Promise<InstallPlan | null> {
  const brew = await hasBin("brew");
  const pip3 = await hasBin("pip3");
  const pip  = await hasBin("pip");
  const platform = process.platform;

  switch (tool) {
    case "semgrep":
      if (brew) return { method: "Homebrew", cmd: ["brew", "install", "semgrep"] };
      if (pip3) return { method: "pip3",     cmd: ["pip3", "install", "semgrep"] };
      if (pip)  return { method: "pip",      cmd: ["pip",  "install", "semgrep"] };
      return null;
    case "bearer":
      if (platform === "darwin" && brew)
        return { method: "Homebrew", cmd: ["brew", "install", "bearer/tap/bearer"] };
      if (platform === "linux")
        return { method: "install script", cmd: ["sh", "-c",
          "curl -sfL https://raw.githubusercontent.com/Bearer/bearer/main/contrib/install.sh | sh -s -- -b /usr/local/bin"] };
      return null;
    case "trivy":
      if (platform === "darwin" && brew)
        return { method: "Homebrew", cmd: ["brew", "install", "aquasecurity/trivy/trivy"] };
      if (platform === "linux")
        return { method: "install script", cmd: ["sh", "-c",
          "curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin"] };
      return null;
  }
}

async function installTool(plan: InstallPlan): Promise<boolean> {
  const proc = Bun.spawn(plan.cmd, { stdout: "inherit", stderr: "inherit", stdin: "inherit" });
  return (await proc.exited) === 0;
}

// ── API key verification ──────────────────────────────────────────────────────

async function verifyApiKey(provider: AiProvider, apiKey: string): Promise<boolean> {
  try {
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey });
      await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      });
    } else if (provider === "openai") {
      const client = new OpenAI({ apiKey });
      await client.models.list();
    } else {
      const client = new GoogleGenAI({ apiKey });
      await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: "hi" }] }],
        config: { maxOutputTokens: 1 },
      });
    }
    return true;
  } catch {
    return false;
  }
}

// ── Separator helper ──────────────────────────────────────────────────────────

function section(title: string, step: string): void {
  console.log(`\n${dim("─".repeat(52))}`);
  console.log(`${c("#58a6ff", step)}  ${bold(title)}`);
  console.log(`${dim("─".repeat(52))}\n`);
}

// ── Main init flow ────────────────────────────────────────────────────────────

export async function runInit(): Promise<void> {
  console.clear();
  console.log(`\n${bold("  sc-code-review")}`);
  console.log(`  ${dim("AI-powered SAST analysis — first-time setup")}\n`);

  // ── Step 1: AI provider ───────────────────────────────────────────────────
  section("AI Provider", "1/3");

  const providerId = await selectFromMenu(
    PROVIDERS.map((p) => ({ label: p.label, meta: p.tagline, value: p.id })),
  );

  const providerDef = PROVIDERS.find((p) => p.id === providerId)!;

  // ── Step 2: Model ─────────────────────────────────────────────────────────
  section("Model", "2/3");

  const model = await selectFromMenu(
    providerDef.models.map((m) => ({
      label: m.label,
      meta: `${m.description}  ${dim(m.price)}`,
      value: m.id,
    })),
  );

  // ── Step 3: API key ───────────────────────────────────────────────────────
  section("API Key", "3/3");

  const { envVar, keyUrl, label: keyLabel, prefix } = providerDef.keyConfig;
  const envKey = process.env[envVar] ?? "";
  let apiKey: string;

  if (envKey && (!prefix || envKey.startsWith(prefix))) {
    const masked = `${envKey.slice(0, 14)}${"•".repeat(18)}`;
    const use = await ask(`Found key in environment (${masked}). Use it? [Y/n] `);
    apiKey = use.toLowerCase() === "n"
      ? await askSecret(`${keyLabel}: `)
      : envKey;
  } else {
    console.log(`${dim("Get your key at")} ${c("#58a6ff", keyUrl)}\n`);
    apiKey = await askSecret(`${keyLabel}: `);
  }

  if (prefix && !apiKey.startsWith(prefix)) {
    console.log();
    printError(`Key must start with ${prefix}. Aborting.`);
    rl.close();
    process.exit(1);
  }

  process.stdout.write(`\n${c("#58a6ff", "→")} Verifying key…`);
  const valid = await verifyApiKey(providerId, apiKey);
  if (!valid) {
    process.stdout.write(` ${c("#f85149", "failed")}\n`);
    printError("Key is invalid or the API is unreachable.");
    rl.close();
    process.exit(1);
  }
  process.stdout.write(` ${c("#3fb950", "OK")}\n`);

  // ── SAST tools ────────────────────────────────────────────────────────────
  section("Security Tools", "✦");

  const toolNames: ToolName[] = ["semgrep", "bearer", "trivy"];
  const toolAvailability: Config["tools"] = { semgrep: false, bearer: false, trivy: false };

  for (const tool of toolNames) {
    const installed = await hasBin(tool);
    if (installed) {
      toolAvailability[tool] = true;
      printSuccess(`${bold(tool)}`);
      continue;
    }

    const plan = await getInstallPlan(tool);
    if (!plan) {
      printWarning(`${bold(tool)} — no auto-installer for this platform, skipping`);
      continue;
    }

    process.stdout.write(`${c("#e3b341", "◌")} ${bold(tool)} — not installed\n`);
    const ans = await ask(`  Install via ${c("#58a6ff", plan.method)}? [Y/n] `);
    if (ans.toLowerCase() === "n") {
      console.log(`  ${dim("Skipped.")}`);
      continue;
    }

    console.log();
    const ok = await installTool(plan);
    console.log();

    toolAvailability[tool] = ok && (await hasBin(tool));
    if (toolAvailability[tool]) {
      printSuccess(`${bold(tool)} installed`);
    } else {
      printWarning(`${bold(tool)} install may have failed — you can add it later`);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  rl.close();

  await saveConfig({ provider: providerId, model, apiKey, tools: toolAvailability });

  const installed = toolNames.filter((t) => toolAvailability[t]);

  console.log(`\n${dim("─".repeat(52))}\n`);
  printSuccess(bold("Setup complete!"));
  console.log(`\n  Provider  ${c("#58a6ff", providerDef.label)}`);
  console.log(`  Model     ${c("#58a6ff", model)}`);
  console.log(`  Tools     ${installed.length ? installed.join(", ") : dim("none — install later")}`);
  console.log(`  Config    ${dim("~/.sc-code-review/config.json")} ${dim("(mode 600)")}`);
  console.log(`\n  ${dim("Run:")} ${c("#3fb950", "sc-code-review scan <directory>")}\n`);
}
