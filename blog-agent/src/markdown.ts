import type { GeneratedArticle } from "./writer.js";

function escapeYaml(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function slugify(title: string): string {
  return title
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

  const slug = slugify(article.title);

  const content = `---
title: "${escapeYaml(article.title)}"
description: "${escapeYaml(article.description)}"
pubDate: ${date}
tags:
${article.tags
  .map(
    (tag) =>
      `  - "${escapeYaml(tag)}"`
  )
  .join("\n")}
---

${article.content.trim()}
`;

  return {
    filename: `${date}-${slug}.md`,
    content
  };
}