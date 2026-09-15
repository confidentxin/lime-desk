#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const backendPort = "52881";
const backendUrl = `http://${host}:${backendPort}`;
const backendEntry = resolve(projectDir, "server", "index.mjs");
const port = "52880";
const url = `http://${host}:${port}`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeCommand = process.execPath;
const useDevServer = process.argv.includes("--dev");
const npmScript = useDevServer ? "dev:fixed" : "deploy:local";

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: projectDir,
    stdio: options.stdio ?? "inherit",
    env: process.env,
    shell: false,
  });
}

function pipeWithPrefix(child, label) {
  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });
}

function installDependenciesIfNeeded() {
  if (existsSync(resolve(projectDir, "node_modules"))) return;

  console.log("node_modules was not found. Installing dependencies...");
  const result = spawnSync(npmCommand, ["install"], {
    cwd: projectDir,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function openBrowser() {
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

// Any HTTP response (even 404/405) proves the process is listening.
async function waitForHttpReady(targetUrl, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fetch(targetUrl, { method: "GET" });
      return true;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
  }

  return false;
}

installDependenciesIfNeeded();

console.log("Starting Lime Desk");
console.log(`Project: ${projectDir}`);
console.log(`Backend: ${backendUrl}`);
console.log(`Fixed URL: ${url}`);
console.log(`Mode: ${useDevServer ? "development server" : "build and local preview"}`);
console.log("Keep this window open while using the app.");
console.log("Press Ctrl+C to stop the local servers.");
console.log("");

const backend = run(nodeCommand, [backendEntry], {
  stdio: ["inherit", "pipe", "pipe"],
});
pipeWithPrefix(backend, "backend");

const backendReady = await waitForHttpReady(backendUrl, 15_000);
if (!backendReady || backend.exitCode !== null) {
  console.error("");
  console.error(`Could not start the backend at ${backendUrl}.`);
  console.error(`Check whether port ${backendPort} is already in use.`);
  if (backend.exitCode === null) backend.kill("SIGTERM");
  process.exit(1);
}
console.log(`Backend ready at ${backendUrl}`);
console.log("");

const server = run(npmCommand, ["run", npmScript], {
  stdio: ["inherit", "pipe", "pipe"],
});
pipeWithPrefix(server, "frontend");

let opened = false;
waitForHttpReady(url, 30_000).then((ready) => {
  if (!ready || opened || server.exitCode !== null) return;
  opened = true;
  console.log(`Opening ${url}`);
  openBrowser();
});

function stopChildren(signal) {
  if (server.exitCode === null) {
    server.kill(signal);
  }
  if (backend.exitCode === null) {
    backend.kill(signal);
  }
}

process.on("SIGINT", () => stopChildren("SIGINT"));
process.on("SIGTERM", () => stopChildren("SIGTERM"));

server.on("exit", (code, signal) => {
  if (backend.exitCode === null) {
    backend.kill(signal ?? "SIGTERM");
  }
  if (!opened && !signal && code !== 0) {
    console.log("");
    console.log(`Could not start the fixed server at ${url}.`);
    console.log(`Check whether port ${port} is already in use.`);
  }
  if (signal === "SIGINT") process.exit(130);
  if (signal === "SIGTERM") process.exit(143);
  process.exit(code ?? 0);
});

backend.on("exit", (code, signal) => {
  if (opened && signal === null) {
    console.log("");
    console.log(`Backend stopped unexpectedly (exit code ${code}). Restart 启动青柠工作台 to recover.`);
  }
});
