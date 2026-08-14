import fs from "node:fs/promises";
import path from "node:path";

const BLOG_DIR = path.resolve(
  process.cwd(),
  "..",
  "src",
  "content",
  "blog"
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