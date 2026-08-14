import fs from "node:fs/promises";
import path from "node:path";

export interface ExistingPost {
  file: string;
  title: string;
  description: string;
  pubDate: string;
  tags: string[];
}

const BLOG_DIR = path.resolve(
  process.cwd(),
  "../src/content/blog"
);

function extractFrontmatter(content: string): string {
  const match = content.match(/^---\s*([\s\S]*?)\s*---/);

  return match?.[1] ?? "";
}

function extractField(
  frontmatter: string,
  field: string
): string {
  const regex = new RegExp(
    `^\\s*${field}:\\s*(.+?)\\s*$`,
    "m"
  );

  const match = frontmatter.match(regex);

  if (!match) {
    return "";
  }

  return match[1]
    .trim()
    .replace(/^["'](.*)["']$/, "$1");
}

function extractTags(frontmatter: string): string[] {
  // Handles:
  // tags: ["one", "two"]
  // tags: ['one', 'two']
  // tags:
  //   - one
  //   - two

  const inlineMatch = frontmatter.match(
    /^\s*tags:\s*\[([^\]]*)\]/m
  );

  if (inlineMatch) {
    return inlineMatch[1]
      .split(",")
      .map((tag) =>
        tag
          .trim()
          .replace(/^["'](.*)["']$/, "$1")
      )
      .filter(Boolean);
  }

  const lines = frontmatter.split(/\r?\n/);
  const tags: string[] = [];

  let collecting = false;

  for (const line of lines) {
    if (/^\s*tags:\s*$/.test(line)) {
      collecting = true;
      continue;
    }

    if (collecting) {
      const match = line.match(/^\s*-\s*(.+?)\s*$/);

      if (!match) {
        break;
      }

      tags.push(
        match[1]
          .trim()
          .replace(/^["'](.*)["']$/, "$1")
      );
    }
  }

  return tags;
}

export async function getExistingPosts(): Promise<ExistingPost[]> {
  const files = await fs.readdir(BLOG_DIR);

  const posts: ExistingPost[] = [];

  for (const file of files) {
    if (!file.endsWith(".md") && !file.endsWith(".mdx")) {
      continue;
    }

    const filePath = path.join(BLOG_DIR, file);
    const content = await fs.readFile(filePath, "utf8");

    const frontmatter = extractFrontmatter(content);

    if (!frontmatter) {
      console.warn(`⚠️ No frontmatter found: ${file}`);
      continue;
    }

    posts.push({
      file,
      title: extractField(frontmatter, "title"),
      description: extractField(frontmatter, "description"),
      pubDate: extractField(frontmatter, "pubDate"),
      tags: extractTags(frontmatter)
    });
  }

  return posts;
}