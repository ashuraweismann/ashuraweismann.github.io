import { z } from "zod";
import { deepseek } from "./deepseek.js";
import type { ExistingPost } from "./blog.js";

const TopicSchema = z.object({
  title: z.string(),
  category: z.string(),
  description: z.string(),

  relevanceScore: z.number().min(0).max(10),
  originalityScore: z.number().min(0).max(10),
  technicalValueScore: z.number().min(0).max(10),

  difficulty: z.enum([
    "beginner",
    "intermediate",
    "advanced"
  ])
});

const TopicResponseSchema = z.object({
  topics: z.array(TopicSchema).length(3),
  selectedTopic: z.string()
});

export type TopicSelection =
  z.infer<typeof TopicResponseSchema>;

function normalizeScore(value: unknown): number {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(
      `Invalid score returned by DeepSeek: ${value}`
    );
  }

  // If the model returns a percentage such as 90,
  // convert it to a 0-10 score.
  if (number > 10 && number <= 100) {
    return number / 10;
  }

  return number;
}

function normalizeTopic(topic: any) {
  return {
    ...topic,

    relevanceScore:
      normalizeScore(topic.relevanceScore),

    originalityScore:
      normalizeScore(topic.originalityScore),

    technicalValueScore:
      normalizeScore(topic.technicalValueScore)
  };
}

export async function chooseTopic(
  posts: ExistingPost[]
): Promise<TopicSelection> {

  const existingPosts = posts.map((post) => ({
    title: post.title,
    description: post.description,
    tags: post.tags
  }));

  const prompt = `
You are the topic-planning agent for a technical cybersecurity blog.

Analyze the existing articles below and propose exactly 3 new article topics.

EXISTING ARTICLES:

${JSON.stringify(existingPosts, null, 2)}

BLOG FOCUS:

- Cybersecurity
- Computer engineering
- Linux
- Networking
- Web security
- CTFs
- AI security
- Practical technical learning

RULES:

1. Do not duplicate an existing article.
2. Avoid topics that are only minor variations of existing articles.
3. Prefer technically useful articles.
4. Prefer practical topics over generic introductions.
5. Topics should be suitable for an intermediate technical audience.
6. The topics should fit naturally with the existing blog.
7. Do not invent facts or references.
8. Return exactly 3 candidates.
9. Select exactly one best candidate.
10. All scores MUST be between 0 and 10.
11. Scores may use decimals such as 8.5.

SCORING:

relevanceScore:
How relevant the topic is to this blog.

originalityScore:
How different the topic is from existing posts.

technicalValueScore:
How useful the article would be to a technical reader.

Return ONLY valid JSON:

{
  "topics": [
    {
      "title": "string",
      "category": "string",
      "description": "string",
      "relevanceScore": 8.5,
      "originalityScore": 9,
      "technicalValueScore": 8,
      "difficulty": "intermediate"
    }
  ],
  "selectedTopic": "string"
}
`;

  const response =
    await deepseek.chat.completions.create({
      model: "deepseek-v4-flash",

      messages: [
        {
          role: "system",
          content:
            "You are a precise technical blog topic planner. Return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],

      temperature: 0.5,

      response_format: {
        type: "json_object"
      }
    });

  const content =
    response.choices[0]?.message?.content;

  if (!content) {
    throw new Error(
      "DeepSeek returned an empty response."
    );
  }

  let parsed: any;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(
      "DeepSeek returned invalid JSON."
    );
  }

  // Normalize AI output before validation.
  parsed.topics = parsed.topics.map(
    normalizeTopic
  );

  // Validate the normalized response.
  return TopicResponseSchema.parse(parsed);
}