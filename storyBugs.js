// storyBugs.js
import dotenv from "dotenv";
import { Version3Client } from "jira.js";
import * as XLSX from "xlsx";

dotenv.config({ path: ".env.local" });

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_FILTER_ID } =
  process.env;

const STORIES_FILTER = `filter = qa-verified-cc AND filter = upcoming-release-cc AND project = CFM AND issuetype IN (Story, "USE Framework")`;

const getStoryBugsFilterUrl = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=issue%20in%20linkedIssues(${storyKey})%20AND%20issuetype%20IN%20(Bug,Regression)`;

const getQA6OnlyBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `issue in linkedIssues(${storyKey}) AND issuetype IN (Bug, Regression) AND status NOT IN (Archive, Duplicate) AND filter != reported-in-production-cc`;

const getProductionBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `issue in linkedIssues(${storyKey}) AND issuetype IN (Bug, Regression) AND status NOT IN (Archive, Duplicate) AND filter = reported-in-production-cc`;

const getStoryBugsCategoryUrl = (storyKey, category) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `issue in linkedIssues(${storyKey}) ` +
  `AND issuetype IN (Bug,Regression) ` +
  `AND "Issue Category[Dropdown]" = "${encodeURIComponent(category)}" ` +
  `AND status NOT IN (Archive, Duplicate)`;

const getUIBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `issue in linkedIssues(${storyKey}) ` +
  `AND issuetype IN (Bug,Regression) ` +
  `AND  "Issue Category[Dropdown]" IN ( UI,"Backend %26 UI","UI%2BAI","UI%2BBackend%2BAI" )` +
  `AND status NOT IN (Archive, Duplicate)`;

const getStoryBugsJQL = (storyKey) =>
  `issue in linkedIssues(${storyKey}) AND issuetype IN (Bug, Regression) AND status NOT IN (Archive, Duplicate)`;

const getQA6UIOnlyBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `issue in linkedIssues(${storyKey}) ` +
  `AND issuetype IN (Bug,Regression) ` +
  `AND  "Issue Category[Dropdown]" IN ( UI,"Backend %26 UI","UI%2BAI","UI%2BBackend%2BAI" )` +
  `AND status NOT IN (Archive, Duplicate) +
    AND filter != reported-in-production-cc`;

const getQA6BackendOnlyBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `issue in linkedIssues(${storyKey}) ` +
  `AND issuetype IN (Bug,Regression) ` +
  `AND  "Issue Category[Dropdown]" IN ( Backend,"Backend %26 UI","Backend%2BAI","UI%2BBackend%2BAI" )` +
  `AND status NOT IN (Archive, Duplicate) +
    AND filter != reported-in-production-cc`;

const getBlockerCriticalBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `issue in linkedIssues(${storyKey}) ` +
  `AND issuetype IN (Bug,Regression) ` +
  `AND  priority in ("Blocker (Immediate Resolution)", Critical)` +
  `AND status NOT IN (Archive, Duplicate)`;

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
  const stories = await client.issueSearch.searchForIssuesUsingJql({
    jql: STORIES_FILTER,
    fields: [
      "summary",
      "status",
      "customfield_15018",
      "customfield_22859",
      "customfield_21718",
    ],
    maxResults: 100,
  });

  const rows = [];

  for (const story of stories.issues) {
    const issueCategoryMap = {};
    const storyKey = story.key;
    const storyTitle = story.fields.summary;
    const status = story.fields.status.name;
    const devs =
      story.fields["customfield_15018"]
        ?.map((user) => user.displayName)
        .join(", ") ?? "Unassigned";
    const pod = story.fields["customfield_22859"].value ?? "Unassigned";
    const UIDevStoryPoints = story.fields["customfield_21718"];

    // 2. Fetch linked bugs
    const bugJql = getStoryBugsJQL(storyKey);
    const bugsResult = await client.issueSearch.searchForIssuesUsingJql({
      jql: bugJql,
      fields: ["customfield_19203", "customfield_18500", "priority"],
      maxResults: 100,
    });

    let qa6Bugs = 0;
    let nonQa6Bugs = 0;
    let uiQA6BugsCount = 0;
    let backendQA6BugsCount = 0;
    let blockerCriticalBugs = 0;
    for (const bug of bugsResult.issues) {
      const temp = bug?.fields?.["customfield_18500"]?.map((x) => x.value);
      const priority = bug?.fields?.["priority"]?.name;
      if (
        priority &&
        (priority.includes("Blocker") || priority.includes("Critical"))
      ) {
        blockerCriticalBugs += 1;
      }
      const issueCategory =
        bug.fields["customfield_19203"]?.value || "Unassigned";
      if (temp?.length === 1 && temp[0] === "QA6") {
        qa6Bugs += 1;
        if (issueCategory.includes("UI")) {
          uiQA6BugsCount += 1;
        }
        if (issueCategory.includes("Backend")) {
          backendQA6BugsCount += 1;
        }
      } else {
        nonQa6Bugs += 1;
      }
      const bugKey = bug.key;
      issueCategoryMap[issueCategory] = [
        ...new Set([...(issueCategoryMap[issueCategory] || []), bugKey]),
      ];
    }

    const bugCount = Object.values(issueCategoryMap).reduce(
      (sum, issues) => sum + issues.length,
      0
    );

    const uiBugCount = Object.keys(issueCategoryMap).reduce(
      (sum, key) =>
        key.includes("UI") ? sum + issueCategoryMap[key].length : sum,
      0
    );

    const bugCountSearchLink = getStoryBugsFilterUrl(storyKey);
    const qa6OnlyBugsSearchLink = getQA6OnlyBugLink(storyKey);
    const nonQa6OnlyBugsSearchLink = getProductionBugLink(storyKey);
    const uiBugCountSearchLnk = getUIBugLink(storyKey);
    const uiQA6OnlyBugsSearchLink = getQA6UIOnlyBugLink(storyKey);
    const backendQA6OnlyBugsSearchLink = getQA6BackendOnlyBugLink(storyKey);
    const blockerBugsSearchLink = getBlockerCriticalBugLink(storyKey);

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
      { v: qa6Bugs, t: "n", l: { Target: qa6OnlyBugsSearchLink } },
      { v: nonQa6Bugs, t: "n", l: { Target: nonQa6OnlyBugsSearchLink } },
      pod,
      { v: uiBugCount, t: "n", l: { Target: uiBugCountSearchLnk } },
      { v: uiQA6BugsCount, t: "n", l: { Target: uiQA6OnlyBugsSearchLink } },
      {
        v: backendQA6BugsCount,
        t: "n",
        l: { Target: backendQA6OnlyBugsSearchLink },
      },
      UIDevStoryPoints,
      status,
      { v: blockerCriticalBugs, t: "n", l: { Target: blockerBugsSearchLink } },
      Object.entries(issueCategoryMap).map(([category, issues]) => ({
        v: `${category} (${issues.length})`,
        l: { Target: getStoryBugsCategoryUrl(storyKey, category) },
        s: {
          font: {
            color: { rgb: "0000FF" }, // Blue
            underline: true,
          },
        },
      })),
    ]);
  }

  return rows.sort((row1, row2) => row2[3].v - row1[3].v);
}

async function main() {
  const data = await fetchStoriesAndBugs();

  // 1st row headers
  const aoa = [
    [
      "Story Key",
      "Story Title",
      "Devs",
      "Bug Count",
      "QA6 Bugs",
      "Production Bugs",
      "Pod",
      "UI Bugs",
      "UI QA6 Bugs",
      "Backend QA6 Bugs",
      "ui dev story points",
      "status",
      "Blocker Critical Bugs Count",
      "Issue Category",
    ],
    ...data.map((r) => [
      r[0], // story key (hyperlinked)
      r[1], // story title (hyperlinked)
      r[2], // devs
      r[3], // bug count (hyperlinked search)
      r[4], // qa6 bug count
      r[5], //non qa6 bug count
      r[6], // pod
      r[7], //UI Bugs
      r[8], //UI Qa6 Bugs
      r[9], //Backend QA6 Bugs
      r[10], // ui dev story points
      r[11], // status
      r[12], //blocker/critical bugs count
      ...r[13], // issue category array (hyperlinked)
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
