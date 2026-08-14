import {
  getDefaultBranch,
  getBranchSha,
  createBranch,
  createOrUpdateFile,
  createPullRequest
} from "./github.js";

async function main() {
  console.log("🚀 Testing GitHub write pipeline...\n");

  const baseBranch = await getDefaultBranch();

  console.log(`Base branch: ${baseBranch}`);

  const baseSha = await getBranchSha(baseBranch);

  console.log(`Base SHA: ${baseSha}`);

  const branchName = "test/blog-agent-api";

  console.log(`\n🌿 Creating branch: ${branchName}`);

  await createBranch(
    branchName,
    baseSha
  );

  const testFile =
    "blog-agent-api-test.md";

  const content = `# Blog Agent API Test

This file was created automatically by the Blog Agent GitHub API test.

If you are reading this in a Pull Request, the branch creation, commit, and PR automation are working correctly.

Test timestamp: ${new Date().toISOString()}
`;

  console.log(
    `\n📝 Creating test file: ${testFile}`
  );

  await createOrUpdateFile(
    branchName,
    testFile,
    content,
    "test: verify blog agent GitHub integration"
  );

  console.log(
    "\n🔀 Creating Pull Request..."
  );

  const prUrl =
    await createPullRequest(
      branchName,
      "test: verify blog agent GitHub integration",
      `## Blog Agent GitHub API Test

This is an automated test Pull Request.

### Verified

- ✅ GitHub authentication
- ✅ Repository access
- ✅ Branch creation
- ✅ File creation
- ✅ Commit creation
- ✅ Pull Request creation

This PR is only a test and can be closed after verification.
`
    );

  console.log(
    `\n🎉 Test completed successfully!`
  );

  console.log(
    `🔗 ${prUrl}`
  );
}

main().catch((error) => {
  console.error(
    "\n❌ GitHub write test failed:"
  );

  console.error(
    error.response?.data ??
    error.message ??
    error
  );

  process.exit(1);
});