import "dotenv/config";
import { Octokit } from "@octokit/rest";

function getRequiredEnv(
  name: string
): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not configured.`
    );
  }

  return value;
}

const token = getRequiredEnv(
  "GITHUB_TOKEN"
);

const owner = getRequiredEnv(
  "GITHUB_OWNER"
);

const repo = getRequiredEnv(
  "GITHUB_REPO"
);

const octokit = new Octokit({
  auth: token
});

export async function getDefaultBranch(): Promise<string> {
  const response = await octokit.repos.get({
    owner,
    repo
  });

  return response.data.default_branch;
}

export async function getBranchSha(
  branch: string
): Promise<string> {
  const response = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`
  });

  return response.data.object.sha;
}

export async function createBranch(
  branchName: string,
  baseSha: string
): Promise<void> {
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha
  });

  console.log(
    `🌿 Created branch: ${branchName}`
  );
}

export async function createOrUpdateFile(
  branchName: string,
  filePath: string,
  content: string,
  message: string
): Promise<void> {
  let existingSha: string | undefined;

  try {
    const response =
      await octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branchName
      });

    if (
      !Array.isArray(response.data) &&
      response.data.type === "file"
    ) {
      existingSha = response.data.sha;
    }
  } catch (error: any) {
    if (error.status !== 404) {
      throw error;
    }
  }

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message,
    content: Buffer.from(
      content,
      "utf8"
    ).toString("base64"),
    branch: branchName,
    ...(existingSha
      ? { sha: existingSha }
      : {})
  });

  console.log(
    `📝 Committed: ${filePath}`
  );
}

export async function createPullRequest(
  branchName: string,
  title: string,
  body: string
): Promise<string> {
  const base =
    await getDefaultBranch();

  const response =
    await octokit.pulls.create({
      owner,
      repo,
      head: branchName,
      base,
      title,
      body
    });

  console.log(
    `🔀 Pull Request created: ${response.data.html_url}`
  );

  return response.data.html_url;
}