# afk

Leave a coding agent working on a feature while you're away from the keyboard.

`afk` runs [Codex](https://github.com/openai/codex) in a loop. Each iteration starts a **fresh, non-interactive Codex session** that uses the `code` skill to implement **one task**. When the session ends, `afk` reads its final answer and decides whether to start another session, finish, or stop. Nobody is asked questions or to approve anything along the way.

`afk` only manages the loop. Picking tasks, writing code, running tests, committing, and tracking progress are all done by the `code` skill, which keeps its state in your project (for example a tasks file and `progress.txt`).

## Prerequisites

- Node.js 20 or newer
- The [Codex CLI](https://github.com/openai/codex), installed and authenticated, with support for `--approve-for-me` (automatic approval review)
- The `code` skill, discoverable by Codex in your project (available from [laskaridis/skills](https://github.com/laskaridis/skills/tree/main/skills/code))
- A prepared workspace: the right Git branch checked out, dependencies installed, and a specification and task list for the agent to work from

`afk` does not create branches, install dependencies, install skills, or log you in to Codex.

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

The prompt is yours: reference whatever specs or task files the agent should use. `afk` appends its own instructions telling Codex to use the `code` skill for one task and to reply with a machine-readable result.

## Giving `afk` a prompt

Provide exactly one of these:

```sh
afk "feature instructions"              # as a single quoted argument
afk --prompt-file prompt.md             # from a file
echo "feature instructions" | afk       # from stdin
```

Providing none, more than one, an empty prompt, or an unreadable file is an error, and no Codex session is started. `afk` never prompts you interactively; a terminal with no prompt counts as missing.

## Options

| Option | Description | Default |
| --- | --- | --- |
| `--prompt-file <path>` | Read the prompt from a file | – |
| `--cwd <directory>` | Workspace for every session (must exist) | current directory |
| `--max-iterations <count>` | Maximum number of Codex session launches, retries included | `10` |
| `--session-timeout <seconds>` | Time limit applied to each session separately | none |
| `--model <model>` | Override the Codex model for every session | inherited from your Codex config |
| `--reasoning-effort <effort>` | Override reasoning effort for every session | inherited from your Codex config |

Counts and timeouts must be positive integers. All other Codex settings come from your existing Codex configuration; `afk` never edits it.

Examples:

```sh
# Work in another directory, allow up to 25 sessions, cap each at 30 minutes
afk --cwd ~/code/my-app --max-iterations 25 --session-timeout 1800 --prompt-file prompt.md

# Use a specific model and effort
afk --model gpt-5 --reasoning-effort high "Finish the tasks in specs/billing.tasks.json"
```

## What you'll see

Codex's own output streams straight to your terminal. `afk` adds status lines on stderr prefixed with `[afk]`:

```
[afk] Iteration 1/10: starting Codex session
...
[afk] Iteration 2/10: starting Codex session
[afk] Task failed: <summary reported by the skill>
...
[afk] Run complete: the code skill reported feature completion.
```

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

If Codex fails to launch, exits unsuccessfully, or returns a missing or malformed final message, `afk` retries once with a fresh session (your partial changes are kept). A second consecutive execution error stops the run. Any valid response resets this allowance.

### Limits and interruption

- **Iteration limit:** every launch, retries included, uses one iteration. If the last allowed iteration ends in `repeat`, `fail`, or needs a retry, the run stops and reports the limit. A `complete` or `blocked` on the last iteration is still honored.
- **Session timeout:** if a session exceeds `--session-timeout`, it is terminated and the whole run stops (no retry). Your changes are preserved.
- **Ctrl+C:** forwarded to the active Codex process, then the run stops. Nothing is rolled back and the skill's working memory is kept.

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

Sessions run with Codex's automatic approval review. `afk` offers no full-access mode and does not widen permissions if an action is denied; the skill reports `blocked` instead.

## Development

```sh
npm run typecheck   # type-check
npm test            # run the test suite (vitest)
npm run build       # compile to dist/
```

See [specs/afk-cli-core.spec.md](specs/afk-cli-core.spec.md) for the full behavior specification.
