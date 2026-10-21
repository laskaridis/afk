export const HELP_TEXT = `Usage: afk [options] "prompt"
       afk [options] --prompt-file <path>
       echo "prompt" | afk [options]

Run Codex unattended, one task per fresh session, using the code skill.

Options:
  --prompt-file <path>          Read the prompt from a file
  --cwd <directory>             Workspace for every session (default: current directory)
  --max-iterations <count>      Maximum number of Codex session launches, retries included (default: 10)
  --session-timeout <seconds>   Time limit applied to each session separately (default: none)
  --model <model>               Override the Codex model for every session
  --reasoning-effort <effort>   Override reasoning effort for every session
  -h, --help                    Show this help and exit

Exit codes:
  0    Feature reported complete
  1    Run stopped: blocker, repeated execution error, iteration limit, or timeout
  2    Invalid options or prompt input; no session started
  130  Interrupted with Ctrl+C
`;
