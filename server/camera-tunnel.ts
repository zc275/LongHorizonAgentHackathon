import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function createCameraTunnel(port: number) {
  let child: ChildProcess | null = null;
  let origin: string | null = null;
  let pending: Promise<string> | null = null;
  return {
    async origin(): Promise<string> {
      if (!existsSync(resolve("dist/phone.html"))) throw new Error("Build the phone page first with npm run build, then try again.");
      if (process.env.CAMERA_PUBLIC_ORIGIN) return process.env.CAMERA_PUBLIC_ORIGIN;
      if (origin && child && child.exitCode === null && !child.killed) return origin;
      if (pending) return pending;
      pending = new Promise<string>((resolveOrigin, reject) => {
        const process = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`], { stdio: ["ignore", "pipe", "pipe"] });
        child = process;
        let output = "";
        let found = "";
        let settled = false;
        const timeout = setTimeout(() => fail("The secure phone link timed out. Check your internet connection and try again."), 40_000);
        const fail = (message: string) => {
          if (settled) return;
          settled = true; clearTimeout(timeout); process.kill(); reject(new Error(message));
        };
        const read = (chunk: Buffer) => {
          output = (output + chunk.toString()).slice(-16000);
          found ||= output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] ?? "";
          if (found && output.includes("Registered tunnel connection") && !settled) {
            settled = true; clearTimeout(timeout); origin = found; resolveOrigin(found);
          }
        };
        process.stdout?.on("data", read);
        process.stderr?.on("data", read);
        process.on("error", () => fail("Install cloudflared to connect a phone, or configure CAMERA_PUBLIC_ORIGIN for your HTTPS camera gateway."));
        process.on("exit", () => { origin = null; if (child === process) child = null; fail("The phone link closed. Try connecting again."); });
      }).finally(() => { pending = null; });
      return pending;
    },
    stop() { child?.kill(); child = null; origin = null; }
  };
}
