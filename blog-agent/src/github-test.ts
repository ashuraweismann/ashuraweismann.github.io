import {
  getDefaultBranch,
  getBranchSha
} from "./github.js";

async function main() {
  console.log("🔐 Testing GitHub API...\n");

  const branch =
    await getDefaultBranch();

  console.log(
    `Default branch: ${branch}`
  );

  const sha =
    await getBranchSha(branch);

  console.log(
    `Branch SHA: ${sha}`
  );

  console.log(
    "\n✅ GitHub API access works."
  );
}

main().catch((error) => {
  console.error(
    "\n❌ GitHub API test failed:"
  );

  console.error(
    error.response?.data ??
    error.message ??
    error
  );

  process.exit(1);
});