// storiesWithOpenBugs.js
import dotenv from "dotenv";
import { Version3Client } from "jira.js";
import fs from "fs";

dotenv.config({ path: ".env.local" });

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;

const STORIES_FILTER = `filter = upcoming-release-cc AND project = CFM AND issuetype IN (Story, "USE Framework") AND filter != qa-verified-cc`;

// Set this to a custom field ID to group by that field (e.g., "customfield_22859" for CFM Pod Name)
// Leave undefined to not group and print normally
const GROUPBY_FIELD = "customfield_22859";

const getStoryBugsJQL = (storyKey) =>
  `issue in linkedIssues(${storyKey}) AND issuetype IN (Bug, Regression) AND filter=status-incomplete-cc`;

const client = new Version3Client({
  host: JIRA_BASE_URL,
  authentication: {
    basic: {
      email: JIRA_EMAIL,
      apiToken: JIRA_API_TOKEN,
    },
  },
});

async function fetchStoriesWithOpenBugs() {
  const stories = await client.issueSearch.searchForIssuesUsingJql({
    jql: STORIES_FILTER,
    fields: [
      "summary",
      "customfield_15018",
      "customfield_19203",
      ...(GROUPBY_FIELD ? [GROUPBY_FIELD] : []),
      "status",
    ],
    maxResults: 1000,
  });

  const storiesWithBugs = [];

  for (const story of stories.issues) {
    const storyKey = story.key;
    const storyTitle = story.fields.summary;
    const storyStatus = story.fields.status.name;
    const devs =
      story.fields["customfield_15018"]
        ?.map((user) => user.displayName)
        .join(", ") ?? "Unassigned";
    const issueCategory = story.fields["customfield_19203"]?.value ?? "Unset";
    const groupByValue = GROUPBY_FIELD
      ? story.fields[GROUPBY_FIELD]?.value ?? "Unset"
      : null;

    // Fetch linked open bugs
    const bugJql = getStoryBugsJQL(storyKey);
    const bugsResult = await client.issueSearch.searchForIssuesUsingJql({
      jql: bugJql,
      fields: ["summary", "status", "priority", "customfield_19203"],
      maxResults: 100,
    });

    if (bugsResult.issues.length > 0) {
      const bugs = bugsResult.issues.map((bug) => ({
        key: bug.key,
        title: bug.fields.summary,
        status: bug.fields.status.name,
        priority: bug.fields.priority?.name || "Unset",
        issueCategory: bug.fields["customfield_19203"]?.value ?? "Unset",
        link: `${JIRA_BASE_URL}browse/${bug.key}`,
      }));

      storiesWithBugs.push({
        storyKey,
        storyTitle,
        storyStatus,
        devs,
        issueCategory,
        groupByValue,
        bugs,
        bugCount: bugs.length,
      });
    }
  }

  return storiesWithBugs.sort((a, b) => b.bugCount - a.bugCount);
}

function generateMarkdown(storiesWithBugs) {
  let markdown = `## Stories with Open Bugs\n\n`;

  if (storiesWithBugs.length === 0) {
    markdown += `🎉 No stories with open bugs found!\n`;
    return markdown;
  }

  if (GROUPBY_FIELD) {
    // Group stories by the specified field
    const storiesByGroup = {};
    for (const story of storiesWithBugs) {
      const groupValue = story.groupByValue;
      if (!storiesByGroup[groupValue]) {
        storiesByGroup[groupValue] = [];
      }
      storiesByGroup[groupValue].push(story);
    }

    // Sort groups alphabetically
    const sortedGroups = Object.keys(storiesByGroup).sort();

    // Generate markdown grouped by the field
    for (const groupValue of sortedGroups) {
      const stories = storiesByGroup[groupValue];

      // Group header
      markdown += `__${groupValue}__\n\n`;

      // Stories in this group (numbered list)
      for (let i = 0; i < stories.length; i++) {
        const story = stories[i];
        const storyNumber = i + 1;

        // Story link (numbered)
        markdown += `${storyNumber}. ${JIRA_BASE_URL}browse/${story.storyKey}\n`;

        // Nested bug bullets (numbered)
        for (let j = 0; j < story.bugs.length; j++) {
          const bug = story.bugs[j];
          const bugNumber = j + 1;
          markdown += `\t ${bugNumber}. ${JIRA_BASE_URL}browse/${bug.key} - ${bug.issueCategory} - ${bug.status}\n`;
        }
        markdown += `\n`;
      }

      markdown += `---\n\n`;
    }
  } else {
    // Print normally without grouping
    for (let i = 0; i < storiesWithBugs.length; i++) {
      const story = storiesWithBugs[i];
      const storyNumber = i + 1;

      // Story link (numbered)
      markdown += `${storyNumber}. ${JIRA_BASE_URL}browse/${story.storyKey}\n`;

      // Nested bug bullets (numbered)
      for (let j = 0; j < story.bugs.length; j++) {
        const bug = story.bugs[j];
        const bugNumber = j + 1;
        markdown += `\t ${bugNumber}. ${JIRA_BASE_URL}browse/${bug.key} - ${bug.issueCategory} - ${bug.status}\n`;
      }
      markdown += `\n`;
    }
  }

  return markdown;
}

async function main() {
  try {
    console.log("Fetching stories with open bugs...");
    const storiesWithBugs = await fetchStoriesWithOpenBugs();

    console.log(`Found ${storiesWithBugs.length} stories with open bugs`);

    const markdown = generateMarkdown(storiesWithBugs);

    // Write to file
    fs.writeFileSync("stories_with_open_bugs.md", markdown, "utf8");
    console.log("Markdown file generated: stories_with_open_bugs.md");

    // Also log summary to console
    console.log("\nSummary:");
    storiesWithBugs.forEach((story) => {
      console.log(`${story.storyKey}: ${story.bugCount} open bugs`);
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
