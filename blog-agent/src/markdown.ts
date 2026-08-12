import type { GeneratedArticle } from "./writer.js";

function escapeYaml(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ");
}

function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function articleToMarkdown(
  article: GeneratedArticle,
  pubDate: Date
) {
  const date =
    pubDate.toISOString().split("T")[0];

  const slug =
    slugify(article.title) ||
    "untitled-post";

  const tags = article.tags
    .map(
      (tag) =>
        `  - "${escapeYaml(tag)}"`
    )
    .join("\n");

  const content = `---
title: "${escapeYaml(article.title)}"
description: "${escapeYaml(article.description)}"
pubDate: ${date}
tags:
${tags}
---

${article.content.trim()}
`;

  return {
    filename: `${date}-${slug}.md`,
    content
  };
}