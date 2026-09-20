import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const execFileAsync = promisify(execFile);

const agentSrcDirectory = dirname(fileURLToPath(import.meta.url));

// build.ts is located at:
// tech-blog/blog-agent/src/build.ts
//
// Going two levels up:
// src -> blog-agent -> tech-blog
const projectRoot = resolve(agentSrcDirectory, "../..");

export async function runAstroBuild(): Promise<void> {
  console.log("\n🏗️ Running Astro build...\n");
  console.log(`📁 Project root: ${projectRoot}`);

  const isWindows = process.platform === "win32";

  try {
    let result;

    if (isWindows) {
      // Execute npm through Windows Command Prompt.
      // This avoids EINVAL errors when spawning npm.cmd directly.
      result = await execFileAsync(
        process.env.COMSPEC || "cmd.exe",
        ["/d", "/s", "/c", "npm run build"],
        {
          cwd: projectRoot,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
        }
      );
    } else {
      result = await execFileAsync(
        "npm",
        ["run", "build"],
        {
          cwd: projectRoot,
          maxBuffer: 10 * 1024 * 1024,
        }
      );
    }

    if (result.stdout) {
      console.log(result.stdout);
    }

    if (result.stderr) {
      console.error(result.stderr);
    }

    console.log("✅ Astro build passed.\n");
  } catch (error: any) {
    if (error.stdout) {
      console.log(error.stdout);
    }

    if (error.stderr) {
      console.error(error.stderr);
    }

    throw new Error(
      `Astro build failed with exit code ${error.code ?? "unknown"}`
    );
  }
}