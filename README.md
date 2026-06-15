# sc-code-review

AI-powered security analysis CLI that combines three SAST tools (Semgrep, Bearer, Trivy) with Claude AI to produce a comprehensive, prioritized security report for any codebase.

## Requirements

- [Bun](https://bun.sh) v1.0 or later
- An [Anthropic API key](https://console.anthropic.com/settings/keys)

## Installation

### 1. Install Bun (if you don't have it)

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Clone and install

```bash
git clone https://github.com/your-username/sc-code-review.git
cd sc-code-review
bun install
```

### 3. Register the global command

```bash
bun link
```

This makes `sc-code-review` available anywhere on your system.

### 4. Run first-time setup

```bash
sc-code-review init
```

The setup wizard will:

1. **Choose your AI provider** — Anthropic (Claude) is supported now; more providers coming soon
2. **Choose a model** — Opus (most capable), Sonnet (balanced), or Haiku (fastest)
3. **Enter your Anthropic API key** — stored securely at `~/.sc-code-review/config.json` (mode `600`)
4. **Install SAST tools** — Semgrep, Bearer CLI, and Trivy are installed automatically if missing (via Homebrew on macOS or install scripts on Linux)

## Usage

```bash
sc-code-review scan <directory>
```

### Options

| Flag | Values | Default | Description |
|---|---|---|---|
| `--output` | `html`, `json`, `both` | `html` | Report output format |
| `--tools` | `semgrep,bearer,trivy` | all | Limit which tools to run |

### Examples

```bash
# Scan a project, generate HTML report (default)
sc-code-review scan ./my-app

# Scan and produce both HTML and JSON reports
sc-code-review scan ./my-app --output both

# Run only Semgrep and Trivy (skip Bearer)
sc-code-review scan ./my-app --tools semgrep,trivy
```

The HTML report is saved as `sc-code-review-report-<timestamp>.html` in your current directory. Open it in any browser.

## SAST Tools

| Tool | What it finds |
|---|---|
| [Semgrep](https://semgrep.dev) | Code-level vulnerabilities, injection flaws, insecure patterns |
| [Bearer CLI](https://github.com/Bearer/bearer) | Security & privacy risks, sensitive data exposure |
| [Trivy](https://aquasecurity.github.io/trivy) | Dependency CVEs, secrets, misconfigurations |

All three run in parallel. Tools that aren't installed are skipped gracefully.

## Manual tool installation

If you skipped auto-install during `sc-code-review init`, you can install the tools yourself:

```bash
# macOS (Homebrew)
brew install semgrep
brew install bearer/tap/bearer
brew install aquasecurity/trivy/trivy

# Linux / macOS without Homebrew
pip3 install semgrep
curl -sfL https://raw.githubusercontent.com/Bearer/bearer/main/contrib/install.sh | sh -s -- -b /usr/local/bin
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
```

Then re-run `sc-code-review init` to register them.

## Building a standalone binary

To compile a self-contained binary (no Bun required on the target machine):

```bash
bun run build
```

This outputs a single `sc-code-review` executable you can copy to `/usr/local/bin` or distribute directly.

## Re-configuring

To change your model, API key, or reinstall tools at any time:

```bash
sc-code-review init
```

Config is stored at `~/.sc-code-review/config.json`.
