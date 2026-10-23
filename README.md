# afk

Leave a coding agent working on a feature while you're away from the keyboard.

`afk` runs a coding agent in a loop. Each iteration starts a **fresh, non-interactive agent session** that uses the `code` skill to implement **one task**. When the session ends, `afk` reads its final answer and decides whether to start another session, finish, or stop. Nobody is asked questions or to approve anything along the way.

`afk` only manages the loop. Picking tasks, writing code, running tests, committing, and tracking progress are all done by the `code` skill, which keeps its state in your project (for example a tasks file and `progress.txt`).

## Prerequisites

- Node.js 20 or newer
- A supported coding agent, installed and authenticated (see [Supported agents](#supported-agents))
- The `code` skill, discoverable by the selected agent in your project (available from [laskaridis/skills](https://github.com/laskaridis/skills/tree/main/skills/code))
- A prepared workspace: the right Git branch checked out, dependencies installed, and a specification and task list for the agent to work from

`afk` does not create branches, install dependencies, install skills, or log you in to the agent.

## Install

Run it without installing:

```sh
npx @laskaridis/afk "your prompt"
```

Or install it globally to get the `afk` command:

```sh
npm install -g @laskaridis/afk
```

The examples below use the bare `afk` command; substitute `npx @laskaridis/afk` if you haven't installed it globally.

## Quick start

From the project you want worked on:

```sh
afk "Implement the feature in specs/my-feature.spec.md using specs/my-feature.tasks.json"
```

Run `afk --help` to see all options.

The prompt is yours: reference whatever specs or task files the agent should use. `afk` appends its own instructions telling the agent to use the `code` skill for one task and to reply with a machine-readable result.

## Giving `afk` a prompt

Provide exactly one of these:

```sh
afk "feature instructions"              # as a single quoted argument
afk --prompt-file prompt.md             # from a file
echo "feature instructions" | afk       # from stdin
```

Providing none, more than one, an empty prompt, or an unreadable file is an error, and no agent session is started. `afk` never prompts you interactively; a terminal with no prompt counts as missing.

## Options

| Option | Description | Default |
| --- | --- | --- |
| `--agent <name>` | Coding agent: `codex` or `claude` | `codex` |
| `--prompt-file <path>` | Read the prompt from a file | – |
| `--cwd <directory>` | Workspace for every session (must exist) | current directory |
| `--max-iterations <count>` | Maximum number of agent session launches, retries included | `10` |
| `--session-timeout <seconds>` | Time limit applied to each session separately | none |
| `--model <model>` | Pass the model to the agent unchanged for every session | agent configuration |
| `--reasoning-effort <effort>` | Pass reasoning effort to the agent unchanged for every session | agent configuration |
| `-h`, `--help` | Show usage, options, and exit codes, then exit | – |

Counts and timeouts must be positive integers. `afk` checks that model and reasoning effort values are non-empty, but does not validate them for the selected agent. Other agent settings come from the agent's own configuration; `afk` never edits it.

Examples:

```sh
# Work in another directory, allow up to 25 sessions, cap each at 30 minutes
afk --cwd ~/code/my-app --max-iterations 25 --session-timeout 1800 --prompt-file prompt.md

# Use a specific model and effort
afk --model gpt-5 --reasoning-effort high "Finish the tasks in specs/billing.tasks.json"
```

## What you'll see

The agent's output is hidden while it runs. `afk` prints status lines on stderr prefixed with `[afk]`:

```
[afk] Iteration 1/10: starting agent session
...
[afk] Iteration 2/10: starting agent session
[afk] Task failed: <summary reported by the skill>
...
[afk] Run complete: the code skill reported feature completion.
```

If a session ends with an execution error, up to the last 20 lines of the agent's stderr appear directly after the `[afk] Execution error: …` line. Agent stderr is not shown for a valid response, timeout, or interruption.

## How a run ends

After each session, the `code` skill's final message must be a single JSON object. `afk` acts on it:

| Skill reports | What `afk` does |
| --- | --- |
| `repeat` | Starts a fresh session for the next task |
| `complete` | Prints a completion message and exits successfully |
| `blocked` (with `blocker_text`) | Prints the blocker and stops, because a human is needed |
| `fail` (with `failure_summary`) | Prints the summary and starts a fresh session so the skill can handle the follow-up work |

`afk` trusts these answers. It does not check your tasks, tests, or Git state itself.

### Execution errors

If the agent fails to launch, exits unsuccessfully, or returns a missing or malformed final message, `afk` retries once with a fresh session (your partial changes are kept). A missing executable is reported as a launch failure and retried once. A second consecutive execution error stops the run. Any valid response resets this allowance.

### Limits and interruption

- **Iteration limit:** every launch, retries included, uses one iteration. If the last allowed iteration ends in `repeat`, `fail`, or needs a retry, the run stops and reports the limit. A `complete` or `blocked` on the last iteration is still honored.
- **Session timeout:** if a session exceeds `--session-timeout`, it is terminated and the whole run stops (no retry). Your changes are preserved.
- **Ctrl+C:** forwarded to the active agent process, then the run stops. Nothing is rolled back and the skill's working memory is kept.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Feature reported complete |
| `1` | Run stopped: blocker, repeated execution error, iteration limit, or timeout |
| `2` | Invalid options or prompt input; no session started |
| `130` | Interrupted with Ctrl+C |

## Continuing later

`afk` keeps no logs, history, or checkpoints. To resume after any stop, fix the cause if needed and run the same command again in the same workspace. You get a fresh session budget, and the `code` skill picks up from the task statuses and progress notes it saved in the project.

## Running unattended

`afk` runs in the foreground. To leave it running after you close your terminal, use your usual tool, such as `tmux`, `screen`, or `nohup`.

Sessions use the selected agent's permission mode described below. `afk` offers no full-access mode and does not widen permissions if an action is denied; the skill reports `blocked` instead.

## Supported agents

### Codex (`--agent codex`)

Requires the [Codex CLI](https://github.com/openai/codex) installed and authenticated, with `--approve-for-me` support for automatic approval review. `afk` launches `codex exec --approve-for-me --cd <workspace> [--model …] [--config model_reasoning_effort=…] -`, sends the prompt on stdin, and reads the final message from stdout. Codex honors both `--model` and `--reasoning-effort`.

### Claude Code (`--agent claude`)

Requires the Claude Code CLI installed and authenticated, the `auto` permission mode available for the account and model, and the `code` skill discoverable by Claude Code (for example under `.claude/skills`). `afk` launches `claude -p --output-format json --permission-mode auto [--model …] [--effort …]` in the selected workspace, sends the prompt on stdin, and reads the final message from its JSON output. Claude Code honors `--model` and `--reasoning-effort` (passed as `--effort`).
