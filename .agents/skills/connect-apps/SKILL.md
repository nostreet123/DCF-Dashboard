---
name: connect-apps
description: Connect Codex to external apps like Gmail, Slack, GitHub. Use this skill when the user wants to send emails, create issues, post messages, or take actions in external services.
---

# Connect Apps
> Note: Adapted from Awesome Codex Skills. Treat upstream assistant/CLI references as Codex/Codex CLI equivalents or adapt to your environment.
> Codex CLI note: If this skill references Codex-specific setup commands, adapt them to your Codex CLI environment (install/configure the equivalent tooling outside Codex and provide required API keys), then proceed with the remaining steps.



Connect Codex to 1000+ apps. Actually send emails, create issues, post messages - not just generate text about it.

## Quick Start

### Step 1: Install the Tool Router (or equivalent integration)
Install the Composio Tool Router (or an equivalent integration) using your environment's package manager or installer.

### Step 2: Run Setup / Authentication
Run the integration’s setup flow and provide your API key when prompted. This will:
- Ask for your free API key (get one at [platform.composio.dev](https://platform.composio.dev/?utm_source=Github&utm_content=AwesomeSkills))
- Configure Codex's connection to 1000+ apps
- Take about 60 seconds

### Step 3: Try It!

After setup, restart Codex CLI and try:```
Send me a test email at YOUR_EMAIL@example.com
```

If it works, you're connected!

## What You Can Do

| Ask Codex to... | What happens |
|------------------|--------------|
| "Send email to sarah@acme.com about the launch" | Actually sends the email |
| "Create GitHub issue: fix login bug" | Creates the issue |
| "Post to Slack #general: deploy complete" | Posts the message |
| "Add meeting notes to Notion" | Adds to Notion |

## Supported Apps

**Email:** Gmail, Outlook, SendGrid
**Chat:** Slack, Discord, Teams, Telegram
**Dev:** GitHub, GitLab, Jira, Linear
**Docs:** Notion, Google Docs, Confluence
**Data:** Sheets, Airtable, PostgreSQL
**And 1000+ more...**

## How It Works

1. You ask Codex to do something
2. Composio Tool Router finds the right tool
3. First time? You'll authorize via OAuth (one-time)
4. Action executes and returns result

## Troubleshooting

- **"Integration not found"** → Make sure the Tool Router (or equivalent integration) is installed and available in your environment
- **"Need to authorize"** → Click the OAuth link Codex provides, then say "done"
- **Action failed** → Check you have permissions in the target app

---

<p align="center">
  <b>Join 20,000+ developers building agents that ship</b>
</p>

<p align="center">
  <a href="https://platform.composio.dev/?utm_source=Github&utm_content=AwesomeSkills">
    <img src="https://img.shields.io/badge/Get_Started_Free-4F46E5?style=for-the-badge" alt="Get Started"/>
  </a>
</p>