import { writeBlogPost } from "./file.js";
import { runAstroBuild } from "./build.js";

import { getExistingPosts } from "./blog.js";
import { chooseTopic } from "./topics.js";
import { generateArticle } from "./writer.js";
import { reviewArticle } from "./reviewer.js";
import { reviseArticle } from "./revision.js";
import { articleToMarkdown } from "./markdown.js";

import {
  getDefaultBranch,
  getBranchSha,
  createBranch,
  createOrUpdateFile,
  createPullRequest
} from "./github.js";

const MAX_REVIEW_ATTEMPTS = 3;

async function main() {
  console.log("🤖 Blog Agent starting...\n");

  // ============================================
  // 1. Analyze existing blog
  // ============================================

  const posts = await getExistingPosts();

  console.log(
    `📚 Found ${posts.length} existing posts.\n`
  );

  // ============================================
  // 2. Choose topic
  // ============================================

  const topicSelection =
    await chooseTopic(posts);

  console.log("🏆 Selected topic:");
  console.log(
    topicSelection.selectedTopic
  );

  console.log();

  // ============================================
  // 3. Generate initial article
  // ============================================

  let article =
    await generateArticle(topicSelection);

  console.log("✅ Article generated.");
  console.log(`Title: ${article.title}`);
  console.log(
    `Characters: ${article.content.length}`
  );

  console.log();

  // ============================================
  // 4. Review + revision loop
  // ============================================

  let finalReview = null;

  for (
    let attempt = 1;
    attempt <= MAX_REVIEW_ATTEMPTS;
    attempt++
  ) {
    console.log(
      `🔎 Review attempt ${attempt}/${MAX_REVIEW_ATTEMPTS}...\n`
    );

    const review =
      await reviewArticle(article);

    finalReview = review;

    console.log(
      `Score: ${review.score}/10`
    );

    console.log(
      `Technical accuracy: ${review.technicalAccuracy}/10`
    );

    console.log(
      `Usefulness: ${review.usefulness}/10`
    );

    console.log(
      `Readability: ${review.readability}/10`
    );

    console.log(
      `Approved: ${review.approved}`
    );

    // --------------------------------------------
    // Show issues
    // --------------------------------------------

    if (review.issues.length > 0) {
      console.log("\n❌ Issues:");

      for (const issue of review.issues) {
        console.log(`- ${issue}`);
      }
    }

    if (review.suggestions.length > 0) {
      console.log("\n💡 Suggestions:");

      for (const suggestion of review.suggestions) {
        console.log(`- ${suggestion}`);
      }
    }

    console.log();

    // --------------------------------------------
    // Article approved
    // --------------------------------------------

    if (review.approved) {
      console.log(
        "✅ Article passed technical review."
      );

      break;
    }

    // --------------------------------------------
    // Maximum attempts reached
    // --------------------------------------------

    if (attempt === MAX_REVIEW_ATTEMPTS) {
      console.log(
        "❌ Article failed the maximum number of review attempts."
      );

      process.exit(1);
    }

    // --------------------------------------------
    // Revise
    // --------------------------------------------

    console.log(
      "🔧 Sending article back for revision...\n"
    );

    article =
      await reviseArticle(
        article,
        review
      );

    console.log(
      "✏️ Article revised."
    );

    console.log(
      `New character count: ${article.content.length}\n`
    );
  }

  // ============================================
  // 5. Convert approved article to Markdown
  // ============================================

  if (!finalReview?.approved) {
    throw new Error(
      "Article did not receive final approval."
    );
  }

  const markdown =
    articleToMarkdown(
      article,
      new Date()
    );

  console.log(
    "\n========== FINAL ARTICLE ==========\n"
  );

  console.log(
    markdown.content.substring(0, 5000)
  );

  console.log(
    "\n========== END ARTICLE ==========\n"
  );

  console.log(
      `📄 Generated filename: ${markdown.filename}`
    );

  console.log(
    "\n🎉 Article successfully generated and reviewed."
  );

    // ============================================
    // 6. Write article to Astro blog
    // ============================================

    const filePath =
      await writeBlogPost(
        markdown.filename,
        markdown.content
      );

    console.log(
      `💾 Article written to: ${filePath}`
    );

    // ============================================
    // 7. Validate Astro build
    // ============================================

    try {
      await runAstroBuild();

      console.log(
        "🎉 Article passed all automated checks."
      );

      console.log(
        "\nNext step: create Git branch and Pull Request."
      );

    } catch (error) {

      console.error(
        "\n❌ Astro build failed."
      );

      console.error(
        "The generated article will NOT be pushed."
      );

      throw error;
    }

    // ============================================
    // 8. Create Git branch and Pull Request
    // ============================================

    console.log(
      "\n🚀 Starting GitHub publishing pipeline..."
    );

    const baseBranch =
      await getDefaultBranch();

    console.log(
      `🌿 Base branch: ${baseBranch}`
    );

    const baseSha =
      await getBranchSha(baseBranch);

    console.log(
      `🔗 Base SHA: ${baseSha}`
    );

    // Create a unique branch name
    const branchName =
      `blog-agent/${markdown.filename
        .replace(/\.md$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")}`;

    console.log(
      `\n🌿 Creating branch: ${branchName}`
    );

    await createBranch(
      branchName,
      baseSha
    );

    // Convert the local path to repository path
    const repositoryPath =
      `src/content/blog/${markdown.filename}`;

    console.log(
      `\n📝 Uploading article: ${repositoryPath}`
    );

    await createOrUpdateFile(
      branchName,
      repositoryPath,
      markdown.content,
      `feat: add ${article.title}`
    );

    // Create PR
    console.log(
      "\n🔀 Creating Pull Request..."
    );

    const prUrl =
      await createPullRequest(
        branchName,
        `feat: ${article.title}`,
        `## 🤖 Weekly Blog Agent Article

    ### Article

    **${article.title}**

    ${article.description}

    ### Automated checks

    - ✅ Topic selected automatically
    - ✅ Article generated with DeepSeek
    - ✅ Technical review completed
    - ✅ Article approved by reviewer
    - ✅ Astro build passed
    - ✅ Markdown frontmatter validated

    ### Review

    Please review the article before merging.

    ---

    🤖 Generated by the Blog Agent.
    `
      );

    console.log(
      "\n🎉 Blog automation completed!"
    );

    console.log(
      `🔗 Pull Request: ${prUrl}`
    );
}

main().catch((error) => {
  console.error("\n❌ Agent failed:");

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exit(1);
});