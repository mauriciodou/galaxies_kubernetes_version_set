// Imports
import { Octokit } from "@octokit/rest";

const octokit: any = new Octokit({
  auth: process.env.GH_TOKEN,
  previews: ["luke-cage-preview"]
});

// Get File from Repo
export const getFileFromRepo = async (
  repo: string,
  owner: string,
  path: string,
  branch: any
) => {
  let options = {
    owner,
    repo,
    path,
    ref: "main"
  };
  if (branch) {
    options.ref = branch;
  }
  const response = await octokit.repos.getContent(options);
  const buff = Buffer.from(response.data.content, "base64");
  const file = buff.toString("utf-8");
  return file;
};

export const createCommit = async (
  repo: any,
  owner: any,
  base: any,
  changes: any
) => {
  // https://developer.github.com/v3/repos/#get-a-repository
  let response = await octokit.request("GET /repos/:owner/:repo", {
    owner,
    repo
  });

  if (!response.data.permissions) {
    throw new Error("[octokit-create-pull-request] Missing authentication");
  }

  // https://developer.github.com/v3/repos/commits/#list-commits-on-a-repository
  response = await octokit.request("GET /repos/:owner/:repo/commits", {
    owner,
    repo,
    sha: base,
    per_page: 1
  });
  let latestCommitSha = response.data[0].sha;
  const treeSha = response.data[0].commit.tree.sha;
  const tree = (
    await Promise.all(
      Object.keys(changes.files).map(async (path) => {
        const value = changes.files[path];

        if (value === null) {
          // Deleting a non-existent file from a tree leads to an "GitRPC::BadObjectState" error,
          // so we only attempt to delete the file if it exists.
          try {
            // https://developer.github.com/v3/repos/contents/#get-contents
            await octokit.request("HEAD /repos/:owner/:repo/contents/:path", {
              owner,
              repo,
              ref: latestCommitSha,
              path
            });

            return {
              path,
              mode: "100644",
              sha: null
            };
          } catch (error) {
            return;
          }
        }

        // Text files can be changed through the .content key
        if (typeof value === "string") {
          return {
            path,
            mode: "100644",
            content: value
          };
        }

        // Binary files need to be created first using the git blob API,
        // then changed by referencing in the .sha key
        const response = await octokit.request(
          "POST /repos/:owner/:repo/git/blobs",
          {
            owner,
            repo,
            ...value
          }
        );
        const blobSha = response.data.sha;
        return {
          path,
          mode: "100644",
          sha: blobSha
        };
      })
    )
  ).filter(Boolean);
  if (tree.length > 0) {
    // https://developer.github.com/v3/git/trees/#create-a-tree
    response = await octokit.request("POST /repos/:owner/:repo/git/trees", {
      owner,
      repo,
      base_tree: treeSha,
      tree
    });

    const newTreeSha = response.data.sha;

    // https://developer.github.com/v3/git/commits/#create-a-commit
    response = await octokit.request("POST /repos/:owner/:repo/git/commits", {
      owner,
      repo,
      message: changes.commit,
      tree: newTreeSha,
      parents: [latestCommitSha]
    });
    latestCommitSha = response.data.sha;

    await octokit.request("PATCH /repos/:owner/:repo/git/refs/:ref", {
      owner,
      repo,
      ref: `heads/${base}`,
      sha: latestCommitSha,
    });
  }
};