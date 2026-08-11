import { z } from "zod";
import { deepseek } from "./deepseek.js";
import type { GeneratedArticle } from "./writer.js";
import type { ArticleReview } from "./reviewer.js";

const ArticleSchema = z.object({
  title: z.string().min(10).max(150),
  description: z.string().min(50).max(300),
  tags: z.array(z.string()).min(1).max(8),
  content: z.string().min(1000)
});

export async function reviseArticle(
  article: GeneratedArticle,
  review: ArticleReview
): Promise<GeneratedArticle> {

  const prompt = `
You are revising a technical cybersecurity article
after a senior technical review.

ARTICLE TITLE:
${article.title}

DESCRIPTION:
${article.description}

TAGS:
${article.tags.join(", ")}

CURRENT ARTICLE:

${article.content}

REVIEW SCORE:
${review.score}/10

TECHNICAL ACCURACY:
${review.technicalAccuracy}/10

USEFULNESS:
${review.usefulness}/10

READABILITY:
${review.readability}/10

ISSUES IDENTIFIED BY THE REVIEWER:

${review.issues.length > 0
    ? review.issues.map((issue) => `- ${issue}`).join("\n")
    : "None"
}

SUGGESTIONS:

${review.suggestions.length > 0
    ? review.suggestions.map((suggestion) => `- ${suggestion}`).join("\n")
    : "None"
}

REVISION REQUIREMENTS:

1. Fix every substantive issue identified by the reviewer.
2. Preserve technically correct material.
3. Do not introduce new unsupported claims.
4. Do not fabricate references, CVEs, statistics, or commands.
5. Verify command syntax carefully.
6. Improve explanations where requested.
7. Remove obvious typos.
8. Preserve the article's overall purpose.
9. Keep the article suitable for an intermediate cybersecurity audience.
10. Do not include YAML frontmatter.
11. Do not include an H1 title.
12. Return the complete revised article, not only the changed sections.

Return ONLY valid JSON:

{
  "title": "Article title",
  "description": "Short description",
  "tags": ["tag1", "tag2"],
  "content": "Complete revised Markdown article"
}
`;

  const response =
    await deepseek.chat.completions.create({
      model: "deepseek-v4-flash",

      messages: [
        {
          role: "system",
          content:
            "You are a meticulous cybersecurity technical editor. Return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],

      temperature: 0.3,

      response_format: {
        type: "json_object"
      }
    });

  const raw =
    response.choices[0]?.message?.content;

  if (!raw) {
    throw new Error(
      "DeepSeek returned an empty revision."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "DeepSeek returned invalid revision JSON."
    );
  }

  return ArticleSchema.parse(parsed);
}