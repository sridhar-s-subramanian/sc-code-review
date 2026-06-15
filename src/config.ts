import { mkdir, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import type { Config } from "./types.ts";

function configDir(): string {
  return `${homedir()}/.sc-code-review`;
}

export function configPath(): string {
  return `${configDir()}/config.json`;
}

export async function configExists(): Promise<boolean> {
  return Bun.file(configPath()).exists();
}

export async function loadConfig(): Promise<Config> {
  const file = Bun.file(configPath());
  if (!(await file.exists())) {
    throw new Error("Not initialized. Run: bun run cli init");
  }
  return file.json() as Promise<Config>;
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(configDir(), { recursive: true });
  await Bun.write(configPath(), JSON.stringify(config, null, 2));
  // Restrict to owner read/write only — same pattern as SSH keys
  await chmod(configPath(), 0o600);
}
