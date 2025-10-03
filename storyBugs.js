// storyBugs.js
import dotenv from "dotenv";
import { Version3Client } from "jira.js";
import * as XLSX from "xlsx";

dotenv.config({ path: ".env.local" });

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;

const getBugFilter = (storyKey) =>
  `(issue in linkedIssues(${storyKey}) OR issue in linkedIssues(${storyKey}, "linked from") OR issue in linkedIssues(${storyKey}, "is bug of") OR issue in linkedIssues(${storyKey}, "blocks") OR issue in linkedIssues(${storyKey}, "is blocked by") OR issue in linkedIssues(${storyKey}, "has bug") OR issue in linkedIssues(${storyKey}, "is caused by") OR issue in linkedIssues(${storyKey}, "causes") OR issue in linkedIssues(${storyKey}, "depends on") OR issue in linkedIssues(${storyKey}, "is parent of") OR issue in linkedIssues(${storyKey}, "is child of") OR issue in linkedIssues(${storyKey}, "relates to") OR issue in linkedIssues(${storyKey}, "related to"))`;

const getStoryBugsFilterUrl = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `${getBugFilter(storyKey)} ` +
  `AND issuetype IN (Bug,Regression) `;

const getQA6OnlyBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `${getBugFilter(
    storyKey
  )} AND issuetype IN (Bug, Regression) AND status NOT IN (Archive, Duplicate) AND filter != reported-in-production-cc`;

const getProductionBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `${getBugFilter(
    storyKey
  )} AND issuetype IN (Bug, Regression) AND status NOT IN (Archive, Duplicate) AND filter = reported-in-production-cc`;

const getUIBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `${getBugFilter(storyKey)} ` +
  `AND issuetype IN (Bug,Regression) ` +
  `AND  "Issue Category[Dropdown]" IN ( UI )` +
  `AND status NOT IN (Archive, Duplicate)`;

const getStoryBugsJQL = (storyKey) =>
  `${getBugFilter(
    storyKey
  )} AND issuetype IN (Bug, Regression) AND status NOT IN (Archive, Duplicate)`;

const getQA6UIOnlyBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `${getBugFilter(storyKey)} ` +
  `AND issuetype IN (Bug,Regression) ` +
  `AND  "Issue Category[Dropdown]" IN ( UI )` +
  `AND status NOT IN (Archive, Duplicate) +
    AND filter != reported-in-production-cc`;

const getQA6BackendOnlyBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `${getBugFilter(storyKey)} ` +
  `AND issuetype IN (Bug,Regression) ` +
  `AND  "Issue Category[Dropdown]" IN ( Backend )` +
  `AND status NOT IN (Archive, Duplicate)` +
  `AND filter != reported-in-production-cc`;

const getBackendBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `${getBugFilter(storyKey)} ` +
  `AND issuetype IN (Bug,Regression) ` +
  `AND  "Issue Category[Dropdown]" IN ( Backend )` +
  `AND status NOT IN (Archive, Duplicate)`;

const getBlockerCriticalBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `${getBugFilter(storyKey)} ` +
  `AND issuetype IN (Bug,Regression) ` +
  `AND  priority in ("Blocker (Immediate Resolution)", Critical)` +
  `AND status NOT IN (Archive, Duplicate)`;

const getBlockerCriticalQA6BugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `${getBugFilter(storyKey)} ` +
  `AND issuetype IN (Bug,Regression) ` +
  `AND  priority in ("Blocker (Immediate Resolution)", Critical)` +
  `AND status NOT IN (Archive, Duplicate) ` +
  `AND filter != reported-in-production-cc`;

const getCombineBugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `${getBugFilter(storyKey)} ` +
  `AND issuetype IN (Bug,Regression) ` +
  `AND  "Issue Category[Dropdown]" NOT IN ( "Backend %26 UI" )` +
  `AND status NOT IN (Archive, Duplicate)`;

const getCombineQA6BugLink = (storyKey) =>
  `${JIRA_BASE_URL}issues/?jql=` +
  `${getBugFilter(storyKey)} ` +
  `AND issuetype IN (Bug,Regression) ` +
  `AND  "Issue Category[Dropdown]" NOT IN ( "Backend %26 UI" )` +
  `AND status NOT IN (Archive, Duplicate) ` +
  `AND filter != reported-in-production-cc`;

function getBusinessDaysDiff(startDate, endDate) {
  let start = new Date(startDate);
  let end = new Date(endDate);
  if (start > end) {
    [start, end] = [end, start];
  }
  let count = 0;
  while (start < end) {
    const day = start.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    start.setDate(start.getDate() + 1);
  }
  return count;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const options = { year: "numeric", month: "long", day: "numeric" };
  return date.toLocaleDateString("en-US", options);
}

function extractQAEvents(historyNodes) {
  const movedToQA = historyNodes.find(
    (o) => o.to === "Waiting For Build" || o.to === "Ready for QA"
  );
  const qaRejected = historyNodes.find((o) => o.to === "QA Rejected");
  const qaBlocked = historyNodes.find((o) => o.to === "QA Blocked");
  const qaVerified = historyNodes.find((o) => o.to === "QA Verified(Main)");
  const uatOrClosed =
    historyNodes.find((o) => o.to === "UAT") ||
    historyNodes.find((o) => o.to === "Closed");
  return {
    movedToQA: movedToQA || uatOrClosed,
    qaRejected,
    qaBlocked,
    qaVerified,
    uatOrClosed,
  };
}

function getFirstBug(bugIssues, movedToQA) {
  if (!bugIssues?.length) return null;
  const sorted = bugIssues
    .map((b) => ({
      key: b.key,
      createdTime: new Date(b.fields.created).getTime(),
    }))
    .filter((b) => b.createdTime >= movedToQA.timestamp)
    .sort((a, b) => a.createdTime - b.createdTime);
  return sorted[0];
}

function firstBugInfo(firstBug) {
  return {
    kind: "BUG",
    firstBugKey: firstBug.key,
    firstBugCreatedTimestamp: firstBug.createdTime,
    firstBugFormattedDate: formatTimestamp(firstBug.createdTime),
    firstQAEventTimestamp: firstBug.createdTime,
    firstQAEventFormattedDate: formatTimestamp(firstBug.createdTime),
  };
}

function analyzeStory(story, bugIssues) {
  const histories = story.changelog?.histories ?? [];
  const historyNodes = histories
    .flatMap((h) =>
      h.items
        .filter((item) => item.field === "status")
        .map((item) => ({
          from: item.fromString,
          to: item.toString,
          timestamp: new Date(h.created).getTime(),
        }))
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const { movedToQA, qaRejected, qaBlocked, qaVerified, uatOrClosed } =
    extractQAEvents(historyNodes);

  if (!movedToQA) return { kind: "NO_QA", key: story.key };

  const firstBug = getFirstBug(bugIssues, movedToQA);

  const baseInfo = {
    key: story.key,
    devDoneTimestamp: movedToQA.timestamp,
    devDoneFormattedDate: formatTimestamp(movedToQA.timestamp),
  };

  if (qaRejected) {
    if (firstBug && firstBug.createdTime <= qaRejected.timestamp) {
      return {
        ...firstBugInfo(firstBug),
        ...baseInfo,
      };
    }
    return {
      ...baseInfo,
      kind: "QA_REJECTED",
      qaRejectedTimestamp: qaRejected.timestamp,
      qaRejectedFormattedDate: formatTimestamp(qaRejected.timestamp),
      firstQAEventTimestamp: qaRejected.timestamp,
      firstQAEventFormattedDate: formatTimestamp(qaRejected.timestamp),
    };
  }

  if (qaBlocked) {
    if (firstBug && firstBug.createdTime <= qaBlocked.timestamp) {
      return {
        ...firstBugInfo(firstBug),
        ...baseInfo,
      };
    }
    return {
      ...baseInfo,
      kind: "QA_BLOCKED",
      qaBlockedTimestamp: qaBlocked.timestamp,
      qaBlockedFormattedDate: formatTimestamp(qaBlocked.timestamp),
      firstQAEventTimestamp: qaBlocked.timestamp,
      firstQAEventFormattedDate: formatTimestamp(qaBlocked.timestamp),
    };
  }

  if (firstBug) {
    return {
      ...firstBugInfo(firstBug),
      ...baseInfo,
    };
  }

  if (qaVerified) {
    return {
      ...baseInfo,
      kind: "QA_VERIFIED",
      qaVerifiedTimestamp: qaVerified.timestamp,
      qaVerifiedFormattedDate: formatTimestamp(qaVerified.timestamp),
      firstQAEventTimestamp: qaVerified.timestamp,
      firstQAEventFormattedDate: formatTimestamp(qaVerified.timestamp),
    };
  }

  if (uatOrClosed) {
    return {
      ...baseInfo,
      kind: "UAT/Closed",
      qaVerifiedTimestamp: uatOrClosed.timestamp,
      qaVerifiedFormattedDate: formatTimestamp(uatOrClosed.timestamp),
      firstQAEventTimestamp: uatOrClosed.timestamp,
      firstQAEventFormattedDate: formatTimestamp(uatOrClosed.timestamp),
    };
  }
}

function processInfo(info) {
  const {
    key,
    devDoneTimestamp,
    devDoneFormattedDate,
    kind,
    firstQAEventTimestamp,
    firstQAEventFormattedDate,
    firstBugKey,
    ...additional
  } = info;

  return {
    key,
    devDoneTimestamp,
    devDoneFormattedDate,
    kind,
    firstQAEventTimestamp,
    firstQAEventFormattedDate,
    firstBugKey,
    businessDaysDiff: getBusinessDaysDiff(
      devDoneTimestamp,
      firstQAEventTimestamp
    ),
    additional,
  };
}

async function getFullChangelog(issueKey) {
  let allHistories = [];
  let startAt = 0;
  const maxResults = 100;
  while (true) {
    const resp = await client.issues.getChangeLogs({
      issueIdOrKey: issueKey,
      startAt,
      maxResults,
    });
    if (resp.values?.length) {
      allHistories.push(...resp.values);
    }
    if (startAt + resp.maxResults >= resp.total) {
      break;
    }
    startAt += maxResults;
  }
  return allHistories;
}

async function fetchChangelogsInBatches(issueKeys, concurrency = 10) {
  const results = {};
  let index = 0;
  async function worker() {
    while (index < issueKeys.length) {
      const current = index++;
      const key = issueKeys[current];
      try {
        results[key] = await getFullChangelog(key);
      } catch (err) {
        console.error(`Failed to fetch changelog for ${key}`, err);
        results[key] = [];
      }
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

const client = new Version3Client({
  host: JIRA_BASE_URL,
  authentication: {
    basic: {
      email: JIRA_EMAIL,
      apiToken: JIRA_API_TOKEN,
    },
  },
});

async function searchAllIssues(jql, fields, pageSize = 100) {
  const allIssues = [];
  let nextPageToken = undefined;
  do {
    const resp =
      await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
        jql,
        fields,
        maxResults: pageSize,
        nextPageToken,
      });
    if (resp?.issues?.length) {
      const issueKeys = resp.issues.map((issue) => issue.key);
      const changelogs = await fetchChangelogsInBatches(issueKeys, 50);
      for (const issue of resp.issues) {
        issue.changelog = { histories: changelogs[issue.key] || [] };
        allIssues.push(issue);
      }
    }
    nextPageToken = resp?.nextPageToken ?? undefined;
  } while (nextPageToken);
  return allIssues;
}

async function fetchStoriesAndBugs(storiesFilter) {
  const stories = await searchAllIssues(
    storiesFilter,
    [
      "summary",
      "status",
      "issuetype",
      "customfield_15018",
      "customfield_22859",
      "customfield_21718",
    ],
    100
  );

  const rows = [];

  for (const story of stories) {
    const issueCategoryMap = {};
    const storyKey = story.key;
    console.log("Processing Story...", storyKey);

    const storyTitle = story.fields.summary;
    const status = story.fields.status.name;
    const issueType = story.fields.issuetype.name;
    const devs =
      story.fields["customfield_15018"]
        ?.map((user) => user.displayName)
        .join(", ") ?? "Unassigned";
    const pod = story.fields["customfield_22859"]?.value ?? "Unassigned";
    const UIDevStoryPoints = story.fields["customfield_21718"];

    // 2. Fetch linked bugs
    const bugJql = getStoryBugsJQL(storyKey);
    const bugIssues = await searchAllIssues(
      bugJql,
      ["customfield_19203", "customfield_18500", "priority", "created"],
      100
    );

    let qa6Bugs = 0;
    let nonQa6Bugs = 0;
    let uiQA6BugsCount = 0;
    let backendQA6BugsCount = 0;
    let blockerCriticalBugs = 0;
    let blockerCriticalQA6Bugs = 0;
    let combineQA6BugsCount = 0;
    for (const bug of bugIssues) {
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
        if (
          priority &&
          (priority.includes("Blocker") || priority.includes("Critical"))
        ) {
          blockerCriticalQA6Bugs += 1;
        }
        if (issueCategory.includes("UI")) {
          uiQA6BugsCount += 1;
        }
        if (issueCategory.includes("Backend")) {
          backendQA6BugsCount += 1;
        }
        if (
          !issueCategory.includes("UI") &&
          !issueCategory.includes("Backend")
        ) {
          combineQA6BugsCount += 1;
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

    const backendBugCount = Object.keys(issueCategoryMap).reduce(
      (sum, key) =>
        key.includes("Backend") ? sum + issueCategoryMap[key].length : sum,
      0
    );

    const combineBugCount = Object.keys(issueCategoryMap).reduce(
      (sum, key) =>
        !key.includes("UI") && !key.includes("Backend")
          ? sum + issueCategoryMap[key].length
          : sum,
      0
    );

    const bugCountSearchLink = getStoryBugsFilterUrl(storyKey);
    const qa6OnlyBugsSearchLink = getQA6OnlyBugLink(storyKey);
    const nonQa6OnlyBugsSearchLink = getProductionBugLink(storyKey);
    const uiBugCountSearchLnk = getUIBugLink(storyKey);
    const uiQA6OnlyBugsSearchLink = getQA6UIOnlyBugLink(storyKey);
    const backendQA6OnlyBugsSearchLink = getQA6BackendOnlyBugLink(storyKey);
    const backendBugCountSearchLink = getBackendBugLink(storyKey);
    const blockerBugsSearchLink = getBlockerCriticalBugLink(storyKey);
    const blockerQA6BugsSearchLink = getBlockerCriticalQA6BugLink(storyKey);
    const combineBugCountSearchLink = getCombineBugLink(storyKey);
    const combineQA6BugsSearchLink = getCombineQA6BugLink(storyKey);

    const storyAnalysis = processInfo(analyzeStory(story, bugIssues));
    let firstQaEventType = `${storyAnalysis.kind}`;
    let firstQaEventDays = storyAnalysis.businessDaysDiff;
    const firstBugKey = storyAnalysis.firstBugKey;

    rows.push([
      {
        v: storyKey,
        l: { Target: `${JIRA_BASE_URL}browse/${storyKey}` },
      },
      {
        v: storyTitle,
        l: { Target: `${JIRA_BASE_URL}browse/${storyKey}` },
      },
      pod,
      issueType,
      status,
      devs,
      { v: bugCount, t: "n", l: { Target: bugCountSearchLink } },
      { v: blockerCriticalBugs, t: "n", l: { Target: blockerBugsSearchLink } },
      {
        v: blockerCriticalQA6Bugs,
        t: "n",
        l: { Target: blockerQA6BugsSearchLink },
      },
      { v: qa6Bugs, t: "n", l: { Target: qa6OnlyBugsSearchLink } },
      { v: uiBugCount, t: "n", l: { Target: uiBugCountSearchLnk } },
      { v: uiQA6BugsCount, t: "n", l: { Target: uiQA6OnlyBugsSearchLink } },
      {
        v: backendBugCount,
        t: "n",
        l: { Target: backendBugCountSearchLink },
      },
      {
        v: backendQA6BugsCount,
        t: "n",
        l: { Target: backendQA6OnlyBugsSearchLink },
      },

      {
        v: combineBugCount,
        t: "n",
        l: { Target: combineBugCountSearchLink },
      },

      {
        v: combineQA6BugsCount,
        t: "n",
        l: { Target: combineQA6BugsSearchLink },
      },
      firstQaEventDays,
      firstQaEventType,
      firstBugKey,
    ]);
  }

  return rows.sort((row1, row2) => row2[8].v - row1[8].v);
}

async function main() {
  const POD_VS_STORIES_FILTER = {
    CFM: 'filter = qa-verified-cc AND filter = upcoming-release-cc AND project = CFM AND issuetype IN (Story, "USE Framework",Security,"Dev Task / Custom Work")',
    INSIGHTS:
      'filter = qa-verified-cc AND project not in (CFM) AND filter = upcoming-release-cc AND (filter = maulik-patel-team-cc OR filter = akash-modi-team-cc) AND issuetype IN (Story, "USE Framework",Security,"Dev Task / Custom Work") OR (issuekey in ("SPACE-121070"))',
  };

  const wb = XLSX.utils.book_new();
  const modules = Object.keys(POD_VS_STORIES_FILTER);

  for (let i = 0; i < modules.length; i++) {
    const key = modules[i];
    const storiesFilter = POD_VS_STORIES_FILTER[key];

    const data = await fetchStoriesAndBugs(storiesFilter);
    // 1st row headers
    const aoa = [
      [
        "Key",
        "Title",
        "Pod",
        "Issue Type",
        "Status",
        "Devs",
        "Total Bugs",
        "Blocker & Critical Bugs (QA6+Prod)",
        "Blocker & Critical Bugs (QA6)",
          "Bugs (QA6)",
          "Bugs (FE)",
          "Bugs (FE AND QA6)",
          "Bugs (BE)",
          "Bugs (BE AND QA6)",
          "Bugs (BE & FE)",
          "Bugs (BE & FE AND QA6)",
        "Business days taken for the Dev to receive feedback",
        "First Feedback Event Type",
        "First Bug Key",
      ],
      ...data.map((r) => [
        r[0], // story key (hyperlinked)
        r[1], // story title (hyperlinked)
        r[2], // pod
        r[3], // issue type
        r[4], // status
        r[5], // devs
        r[6], // blocker/critical bugs count
        r[7], // blocker/critical QA6 bugs count
        r[8], // bug count (hyperlinked search)
        r[9], // qa6 bug count
        r[10], // UI Bugs
        r[11], // UI QA6 Bugs
        r[12], // Backend Only Bugs
        r[13], // Backend QA6 Bugs
        r[14], // Combine Bugs
        r[15], // Combine QA6 bugs
        r[16], // First QA Event Type
        r[17], // Business Days for First QA Event
        r[18], // First Bug key
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Column widths
    const widths = [{ wch: 12 }, { wch: 80 }, { wch: 20 }, { wch: 14 }];
    widths[15] = { wch: 30 };
    ws["!cols"] = widths;

    XLSX.utils.book_append_sheet(wb, ws, `${key}`);
  }

  XLSX.writeFile(wb, "stories_bugs.xlsx");
}

main().catch((err) => console.error(err));
