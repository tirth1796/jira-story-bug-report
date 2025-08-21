// storyBugs.js
import dotenv from "dotenv";
import { Version3Client } from "jira.js";
import * as XLSX from "xlsx";
import fs from "fs";

dotenv.config({ path: ".env.local" });

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_FILTER_ID } =
  process.env;

const client = new Version3Client({
  host: JIRA_BASE_URL,
  authentication: {
    basic: {
      email: JIRA_EMAIL,
      apiToken: JIRA_API_TOKEN,
    },
  },
});

async function fetchStoriesAndBugs() {
  // 1. Fetch all stories from filter
  const jql = `filter=${JIRA_FILTER_ID} ORDER BY cf[15018]`;

  const stories = await client.issueSearch.searchForIssuesUsingJql({
    jql,
    fields: ["summary", "customfield_15018"],
    maxResults: 100,
  });

  const rows = [];
  const seenBugs = new Set();

  for (const story of stories.issues) {
    const storyKey = story.key;
    const storyTitle = story.fields.summary;
    const devs =
      story.fields["customfield_15018"]
        ?.map((user) => user.displayName)
        .join(", ") ?? "Unassigned";

    // 2. Fetch linked bugs
    const bugJql = `issue in linkedIssues(${storyKey}) AND issuetype IN (Bug, Regression) AND status NOT IN (Archive, Duplicate) AND filter=issue-category-ui`;
    const bugsResult = await client.issueSearch.searchForIssuesUsingJql({
      jql: bugJql,
      fields: ["summary"],
      maxResults: 100,
    });

    const bugs = [];
    for (const bug of bugsResult.issues) {
      const bugKey = bug.key;
      const bugTitle = bug.fields.summary;
      const bugLink = `${JIRA_BASE_URL}browse/${bugKey}`;

      if (seenBugs.has(bugKey)) {
        console.log("seenBugs", bugKey);
        // mark duplicate in red
        bugs.push({
          v: bugKey,
          l: { Target: bugLink, Tooltip: bugTitle },
          s: { font: { color: { rgb: "FF0000" } } },
        });
      } else {
        seenBugs.add(bugKey);
        bugs.push({ v: bugKey, l: { Target: bugLink, Tooltip: bugTitle } });
      }
    }

    const bugCount = bugs.length;
    const bugCountSearchLink = `${JIRA_BASE_URL}issues/?jql=issue%20in%20linkedIssues(${storyKey})%20AND%20issuetype%20IN%20(Bug,Regression)`;

    rows.push([
      {
        v: storyKey,
        l: { Target: `${JIRA_BASE_URL}browse/${storyKey}` },
      },
      {
        v: storyTitle,
        l: { Target: `${JIRA_BASE_URL}browse/${storyKey}` },
      },
      devs,
      { v: bugCount, t: "n", l: { Target: bugCountSearchLink } },
      bugs.map((b) => (typeof b === "string" ? { v: b } : b)), // keep hyperlink & styles
    ]);
  }

  return rows.sort((row1, row2) => row2[3].v - row1[3].v);
}

async function main() {
  const data = await fetchStoriesAndBugs();

  // 1st row headers
  const aoa = [
    ["Story Key", "Story Title", "Devs", "Bug Count", "Bugs"],
    ...data.map((r) => [
      r[0], // story key (hyperlinked)
      r[1], // story title (hyperlinked)
      r[2], // devs
      r[3], // bug count (hyperlinked search)
      ...r[4], // array of bugs (hyperlinks, styled for duplicates)
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws["!cols"] = [{ wch: 10 }, { wch: 80 }, { wch: 30 }, { wch: 8 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stories & Bugs");

  XLSX.writeFile(wb, "stories_bugs.xlsx");
}

main().catch((err) => console.error(err));
