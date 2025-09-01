// storiesWithOpenBugs.js
import dotenv from "dotenv";
import { Version3Client } from "jira.js";
import fs from "fs";

dotenv.config({ path: ".env.local" });

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;

const STORIES_FILTER = `filter = upcoming-release-cc AND project = CFM AND issuetype IN (Story, "USE Framework") AND filter != qa-verified-cc`;

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
      "customfield_22859",
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
    const podName = story.fields["customfield_22859"]?.value ?? "Unset";

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
        podName,
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

  // Group stories by pod
  const storiesByPod = {};
  for (const story of storiesWithBugs) {
    const podName = story.podName;
    if (!storiesByPod[podName]) {
      storiesByPod[podName] = [];
    }
    storiesByPod[podName].push(story);
  }

  // Sort pods alphabetically
  const sortedPods = Object.keys(storiesByPod).sort();

  // Generate markdown grouped by pod
  for (const podName of sortedPods) {
    const stories = storiesByPod[podName];

    // Pod header
    markdown += `__${podName}__\n\n`;

    // Stories in this pod (numbered list)
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
