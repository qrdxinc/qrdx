// Links to the QRdx repository (edit this page, open an issue). Docs feedback
// used to post to GitHub Discussions from a server action here; that path was
// disabled and has been removed, so nothing on the site writes to GitHub.
// Page feedback is an analytics event now (components/docs/page-feedback.tsx).

import { GITHUB_OWNER, GITHUB_REPO } from "@repo/config";
export const repo = GITHUB_REPO;
export const owner = GITHUB_OWNER;

interface GitHubIssueUrlParams {
  owner: string;
  repo: string;
  title?: string;
  body?: string;
  labels?: string[];
  template?: string;
  projects?: string[];
  assignees?: string[];
  milestone?: string;
}

/**
 * Generates a GitHub issue URL with the provided parameters.
 * https://docs.github.com/en/issues/tracking-your-work-with-issues/creating-an-issue#creating-an-issue-from-a-url-query
 *
 * @param params - Parameters for the GitHub issue URL.
 * @param params.owner - The GitHub repository owner's username.
 * @param params.repo - The name of the GitHub repository.
 * @param params.title - Optional title of the issue.
 * @param params.body - Optional body content of the issue.
 * @param params.labels - Optional array of labels for the issue.
 * @param params.template - Optional template file name for the issue.
 * @param params.projects - Optional array of project names to associate with the issue.
 * @param params.assignees - Optional array of usernames to assign the issue to.
 * @param params.milestone - Optional milestone to associate with the issue.
 * @returns A string containing the generated GitHub issue URL.
 */
export function getGitHubIssueUrl(params: GitHubIssueUrlParams): string {
  const { owner, repo, ...issueParams } = params;
  const baseUrl = `https://github.com/${owner}/${repo}/issues/new`;
  const urlParams = new URLSearchParams();

  for (const [key, value] of Object.entries(issueParams)) {
    if (Array.isArray(value)) {
      for (const item of value) urlParams.append(key, item);
    } else if (value !== undefined) {
      urlParams.append(key, value.toString());
    }
  }

  return `${baseUrl}?${urlParams.toString()}`;
}

/** Where the docs' content lives in the repository. */
export const DOCS_CONTENT_DIR = "apps/docs/content/docs";

/**
 * GitHub's editor for a docs page, from the page's file path inside
 * content/docs ("help/index.mdx", "developers/mcp.es.mdx"): the file that
 * rendered, so an index page edits its index.mdx and a translated page its
 * translation. The old helper built the path from the page URL and so
 * pointed index pages at a file that doesn't exist.
 */
export function getGithubEditUrl(filePath: string): string {
  const path = filePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://github.com/${owner}/${repo}/edit/main/${DOCS_CONTENT_DIR}/${path}`;
}
