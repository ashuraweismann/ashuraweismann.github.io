import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

// file.ts is at: tech-blog/blog-agent/src/file.ts
// Resolve to tech-blog/src/content/blog
const BLOG_DIR = path.resolve(
  currentDirectory,
  "../../src/content/blog"
);

export async function writeBlogPost(
  filename: string,
  content: string
): Promise<string> {
  await fs.mkdir(BLOG_DIR, {
    recursive: true
  });

  const filePath = path.join(
    BLOG_DIR,
    filename
  );

  await fs.writeFile(
    filePath,
    content,
    "utf8"
  );

  return filePath;
}

export async function deleteBlogPost(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}