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

export interface WritePostResult {
  filePath: string;
  isNew: boolean;
  previousContent?: string;
}

export async function writeBlogPost(
  filename: string,
  content: string
): Promise<WritePostResult> {
  await fs.mkdir(BLOG_DIR, {
    recursive: true
  });

  const filePath = path.join(
    BLOG_DIR,
    filename
  );

  let isNew = true;
  let previousContent: string | undefined;

  try {
    previousContent = await fs.readFile(filePath, "utf8");
    isNew = false;
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  await fs.writeFile(
    filePath,
    content,
    "utf8"
  );

  return {
    filePath,
    isNew,
    previousContent
  };
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

export async function rollbackBlogPost(
  result: WritePostResult
): Promise<void> {
  if (result.isNew) {
    await deleteBlogPost(result.filePath);
  } else if (result.previousContent !== undefined) {
    await fs.writeFile(
      result.filePath,
      result.previousContent,
      "utf8"
    );
  }
}