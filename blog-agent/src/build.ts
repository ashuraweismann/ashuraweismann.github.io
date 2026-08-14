import path from "node:path";
import { spawn } from "node:child_process";

export function runAstroBuild(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("\n🏗️ Running Astro build...\n");

    const blogRoot = path.resolve(
      process.cwd(),
      ".."
    );

    const isWindows =
      process.platform === "win32";

    const command = isWindows
      ? process.env.ComSpec || "cmd.exe"
      : "npm";

    const args = isWindows
      ? ["/d", "/s", "/c", "npm run build"]
      : ["run", "build"];

    const child = spawn(
      command,
      args,
      {
        cwd: blogRoot,
        stdio: "inherit",
        shell: false
      }
    );

    child.on("error", (error) => {
      reject(
        new Error(
          `Failed to start Astro build: ${error.message}`
        )
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(
          "\n✅ Astro build passed.\n"
        );

        resolve();
      } else {
        reject(
          new Error(
            `Astro build failed with exit code ${code}`
          )
        );
      }
    });
  });
}