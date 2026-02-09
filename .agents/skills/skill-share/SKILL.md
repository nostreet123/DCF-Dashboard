---
name: skill-share
description: A skill that creates new Codex skills and can share them on Slack via Rube after explicit confirmation.
---

> Note: Adapted from Awesome Codex Skills. Treat upstream assistant/CLI references as Codex/Codex CLI equivalents or adapt to your environment.
> Codex CLI note: If this skill references Codex-specific setup commands, adapt them to your Codex CLI environment (install/configure the equivalent tooling outside Codex and provide required API keys), then proceed with the remaining steps.


## When to use this skill

Use this skill when you need to:
- **Create new Codex skills** with proper structure and metadata
- **Generate skill packages** ready for distribution
- **Optionally share created skills** on Slack channels for team visibility
- **Validate skill structure** before sharing
- **Package and distribute** skills to your team

Also use this skill when:
- **User says he wants to create/share his skill** 

This skill is ideal for:
- Creating skills as part of team workflows
- Building internal tools that need skill creation + team notification
- Automating the skill development pipeline
- Collaborative skill creation with team notifications

## Key Features

### 1. Skill Creation
- Creates properly structured skill directories with SKILL.md
- Generates standardized scripts/, references/, and assets/ directories
- Auto-generates YAML frontmatter with required metadata
- Enforces naming conventions (hyphen-case)

### 2. Skill Validation
- Validates SKILL.md format and required fields
- Checks naming conventions
- Ensures metadata completeness before packaging

### 3. Skill Packaging
- Creates distributable zip files
- Includes all skill assets and documentation
- Runs validation automatically before packaging

### 4. Slack Integration via Rube (Opt-In)
- Sends created skill information to designated Slack channels only after explicit confirmation
- Shares skill metadata (name, description, link)
- Posts skill summary for team discovery
- Provides direct links to skill files

## How It Works

1. **Initialization**: Provide skill name and description
2. **Creation**: Skill directory is created with proper structure
3. **Validation**: Skill metadata is validated for correctness
4. **Packaging**: Skill is packaged into a distributable format
5. **Optional Slack Notification**: If explicitly confirmed, skill details are posted to a user-confirmed Slack destination

## Example Usage```
When you ask Codex to create a skill called "pdf-analyzer":
1. Creates /skill-pdf-analyzer/ with SKILL.md template
2. Generates structured directories (scripts/, references/, assets/)
3. Validates the skill structure
4. Packages the skill as a zip file
5. If confirmed, posts to Slack: "New Skill Created: pdf-analyzer - Advanced PDF analysis and extraction capabilities"
```

## Integration with Rube

This skill leverages Rube for:
- **SLACK_SEND_MESSAGE**: Posts skill information to team channels
- **SLACK_POST_MESSAGE_WITH_BLOCKS**: Shares rich formatted skill metadata
- **SLACK_FIND_CHANNELS**: Discovers target channels for skill announcements

## Security Defaults

- **No automatic outbound posting**: Slack posting is disabled by default.
- **Explicit confirmation required**: Require a clear user confirmation in the current run before posting.
- **Preview before publish**: Show message payload and target channel/user before sending.

## Requirements

- Slack workspace connection via Rube
- Write access to skill creation directory
- Python 3.7+ for skill creation scripts
- Target Slack channel for skill notifications
