import path from "node:path";
import { spawn } from "node:child_process";

export function runAstroBuild(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("\n🏗️ Running Astro build...\n");

    const command =
      process.platform === "win32"
        ? "npm.cmd"
        : "npm";

    const child = spawn(
      command,
      ["run", "build"],
      {
        cwd: pathToBlog(),
        stdio: "inherit",
        shell: false
      }
    );

    child.on("error", (error) => {
      reject(error);
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

function pathToBlog(): string {
  return path.resolve(
    process.cwd(),
    ".."
  );
}