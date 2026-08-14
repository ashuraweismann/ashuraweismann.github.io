import { z } from "zod";
import { deepseek } from "./deepseek.js";
import type { TopicSelection } from "./topics.js";

const ArticleSchema = z.object({
  title: z.string().min(10).max(150),
  description: z.string().min(50).max(300),
  tags: z.array(z.string()).min(1).max(8),
  content: z.string().min(1000)
});

export type GeneratedArticle =
  z.infer<typeof ArticleSchema>;

export async function generateArticle(
  topicSelection: TopicSelection
): Promise<GeneratedArticle> {

  const selectedTopic =
    topicSelection.topics.find(
      (topic) =>
        topic.title ===
        topicSelection.selectedTopic
    );

  if (!selectedTopic) {
    throw new Error(
      "Selected topic could not be found."
    );
  }

  console.log(
    `✍️ Writing: ${selectedTopic.title}\n`
  );

  const prompt = `
You are the primary technical writer for a
cybersecurity and computer engineering blog.

Write a complete technical article about:

TITLE:
${selectedTopic.title}

CATEGORY:
${selectedTopic.category}

TOPIC DESCRIPTION:
${selectedTopic.description}

DIFFICULTY:
${selectedTopic.difficulty}

TARGET AUDIENCE:

- Computer engineering students
- Cybersecurity learners
- Developers
- CTF players
- Technical readers

ARTICLE REQUIREMENTS:

1. Write clear professional English.
2. Target an intermediate technical audience.
3. Explain important concepts before using them.
4. Prefer practical examples.
5. Use Markdown headings.
6. Use code blocks when genuinely useful.
7. Explain commands instead of blindly listing them.
8. Include security considerations.
9. Include defensive recommendations where relevant.
10. Include a conclusion.
11. Do not fabricate facts.
12. Do not fabricate CVEs.
13. Do not fabricate statistics.
14. Do not fabricate references.
15. Do not create fake citations.
16. Do not claim a technique works universally.
17. Clearly state assumptions.
18. Do not include YAML frontmatter.
19. Do not include an H1 title.
20. Use H2/H3 headings.
21. Aim for approximately 1500-2200 words.

STRUCTURE:

## Introduction

Explain why the topic matters.

## Core Concepts

Explain the important technical concepts.

## Practical Walkthrough

Provide practical examples where appropriate.

## Security Implications

Explain how the technique can be abused or detected.

## Defensive Considerations

Explain how defenders can reduce the risk.

## Conclusion

Summarize the important lessons.

Return ONLY valid JSON.

Use exactly this structure:

{
  "title": "Article title",
  "description": "Short article description",
  "tags": [
    "tag1",
    "tag2"
  ],
  "content": "Markdown article content"
}
`;

  const response =
    await deepseek.chat.completions.create({
      model: "deepseek-v4-flash",

      messages: [
        {
          role: "system",
          content:
            "You are a careful technical cybersecurity writer. Return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],

      temperature: 0.6,

      response_format: {
        type: "json_object"
      }
    });

  const raw =
    response.choices[0]?.message?.content;

  if (!raw) {
    throw new Error(
      "DeepSeek returned an empty article."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "DeepSeek returned invalid JSON."
    );
  }

  return ArticleSchema.parse(parsed);
}