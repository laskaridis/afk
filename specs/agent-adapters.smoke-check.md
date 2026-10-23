# Agent adapters manual smoke check

Date: 2026-10-23 (EEST)

Workspace: `/private/tmp/afk-agent-smoke.BWYmEz`, a scratch Git repository with the `code` skill copied into `.agents/skills/code` and exposed to Claude Code through `.claude/skills`. The workspace contains no feature specification or task list. The CLI was built with `pnpm build` and run from `dist/cli.js`.

## CLI versions

- Codex: `codex-cli 0.162.1` (`codex --version`)
- Claude Code: `2.1.307 (Claude Code)` (`claude --version`)

## Codex final message on piped stdout

Command (run in the scratch workspace):

```sh
printf '%s\n' 'Reply with the single word hello' | codex exec --approve-for-me -o out.txt - > stdout.txt 2> codex-direct-stderr.txt
```

Observed exit code: `0`. `stdout.txt` contained `hello` followed by a newline; `out.txt` contained `hello` followed by a newline. The contents match after trimming surrounding whitespace. **PASS**.

The first attempt stopped before launch because the scratch directory was not a Git repository. After `git init -q` in that directory, the command above succeeded.

## End-to-end afk runs

Both commands were run in the scratch workspace. Agent stdout was captured by `afk`; the process stdout files were empty.

### Codex

```sh
node /Users/e.laskaridis/Projects/sandbox/afk/dist/cli.js --agent codex --cwd /private/tmp/afk-agent-smoke.BWYmEz "Do the next task"
```

Observed stderr:

```text
[afk] Iteration 1/10: starting agent session
[afk] Run blocked: The feature specification and task list are missing, and the workspace contains no project files. Provide both so I can select and implement one task.
```

Observed exit code: `1`. **PASS**.

### Claude Code

```sh
node /Users/e.laskaridis/Projects/sandbox/afk/dist/cli.js --agent claude --cwd /private/tmp/afk-agent-smoke.BWYmEz "Do the next task"
```

Observed stderr:

```text
[afk] Iteration 1/10: starting agent session
[afk] Run blocked: No feature specification or task list was provided. The prompt only said 'Do the next task'. The workspace has no spec, task list or progress.txt, only harness output files and skill directories. To unblock, give the path to a feature spec and a task list, or put them in the workspace, then re-run.
```

Observed exit code: `1`. **PASS**.

## Follow-up fixes

On 2026-10-23, Claude Code `2.1.309` was run in an empty scratch directory with
`claude -p --output-format json --max-turns 1 "Use a tool to list files in this empty directory, then summarize what you found."`.
It exited with code `1` and wrote parseable JSON to stdout with `is_error: true`
and `subtype: "error_max_turns"`. This confirms the prerequisite for TASK-019.
