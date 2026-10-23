import { DEFAULT_AGENT, agentNames } from './agents/index.js';

export const HELP_TEXT = `Usage: afk [options] "prompt"
       afk [options] --prompt-file <path>
       echo "prompt" | afk [options]

Run a coding agent unattended, one task per fresh session.

Options:
  --agent <name>                Coding agent to run: ${agentNames().join(', ')} (default: ${DEFAULT_AGENT})
  --prompt-file <path>          Read the prompt from a file
  --cwd <directory>             Workspace for every session (default: current directory)
  --max-iterations <count>      Maximum number of agent session launches, retries included (default: 10)
  --session-timeout <seconds>   Time limit applied to each session separately (default: none)
  --model <model>               Model passed to the agent unchanged for every session
  --reasoning-effort <effort>   Reasoning effort passed to the agent unchanged for every session
  -h, --help                    Show this help and exit

Exit codes:
  0    Feature reported complete
  1    Run stopped: blocker, repeated execution error, iteration limit, or timeout
  2    Invalid options or prompt input; no session started
  130  Interrupted with Ctrl+C
`;
