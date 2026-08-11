import { z } from "zod";
import { deepseek } from "./deepseek.js";
import type { GeneratedArticle } from "./writer.js";

const ReviewSchema = z.object({
  approved: z.boolean(),
  score: z.number().min(0).max(10),

  technicalAccuracy: z.number().min(0).max(10),
  usefulness: z.number().min(0).max(10),
  readability: z.number().min(0).max(10),

  issues: z.array(z.string()),
  suggestions: z.array(z.string())
});

export type ArticleReview =
  z.infer<typeof ReviewSchema>;

export async function reviewArticle(
  article: GeneratedArticle
): Promise<ArticleReview> {

  const prompt = `
You are the senior technical reviewer for a cybersecurity blog.

Review the following article before it is allowed to reach a human editor.

ARTICLE TITLE:
${article.title}

DESCRIPTION:
${article.description}

TAGS:
${article.tags.join(", ")}

ARTICLE:

${article.content}

Evaluate the article carefully.

CHECK FOR:

1. Technical accuracy
2. Incorrect cybersecurity claims
3. Incorrect commands or syntax
4. Misleading explanations
5. Missing important context
6. Dangerous assumptions
7. Unsupported claims
8. Fake or fabricated references
9. Poor organization
10. Repetition
11. Readability
12. Whether the article is actually useful to an intermediate technical reader

SECURITY:

Pay particular attention to offensive-security instructions.

The article may explain legitimate cybersecurity techniques, CTF concepts,
network scanning, penetration testing, and defensive security.

However, identify technically incorrect, misleading, or unnecessarily
dangerous instructions.

SCORING:

technicalAccuracy:
0 = fundamentally incorrect
10 = technically accurate

usefulness:
0 = little practical value
10 = highly useful

readability:
0 = very difficult to understand
10 = clear and well structured

overall score:
Use your judgment based on all three dimensions.

APPROVAL:

Set approved=true only if:

- The article is technically sound.
- There are no major factual errors.
- Commands and technical examples are reasonable.
- The article is suitable for publication after normal human review.
- There are no critical issues requiring rewriting.

Minor suggestions do NOT necessarily require rejection.

Return ONLY valid JSON:

{
  "approved": true,
  "score": 8.5,
  "technicalAccuracy": 9,
  "usefulness": 8,
  "readability": 8,
  "issues": [],
  "suggestions": [
    "Consider adding..."
  ]
}
`;

  const response =
    await deepseek.chat.completions.create({
      model: "deepseek-v4-flash",

      messages: [
        {
          role: "system",
          content:
            "You are a strict but fair senior cybersecurity technical reviewer. Return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],

      temperature: 0.2,

      response_format: {
        type: "json_object"
      }
    });

  const raw =
    response.choices[0]?.message?.content;

  if (!raw) {
    throw new Error(
      "DeepSeek returned an empty review."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "DeepSeek returned invalid review JSON."
    );
  }

  return ReviewSchema.parse(parsed);
}