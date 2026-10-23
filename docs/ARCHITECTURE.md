# Architecture

`afk` runs a coding agent unattended, one task per fresh session, until the agent reports that the work is complete or blocked, or a run limit is reached. It is a thin, agent-neutral harness: what the user sees and every policy decision are the same whichever agent runs.

## Key decisions

- **One fresh session per task.** Each session starts with no memory of the last. Continuity lives in the workspace and the agent's own work, not in the harness.
- **The harness keeps no state.** There is no persistence between sessions or runs. The Run Loop only counts iterations and consecutive errors.
- **The agent talks to the harness through its final message.** That message is a small JSON protocol (repeat / complete / blocked / fail). Because the protocol is the only contract, the harness never depends on how an agent works internally.
- **No interaction.** Nobody answers questions or approves actions during a session. The agent runs with its own auto-approval enabled.
- **The agent is the only thing that varies.** Everything else is fixed, so behaviour is identical whichever agent runs.

## Style

A **layered pipeline**: a functional core inside an imperative shell, with two edges.

- Each layer turns a lower-level result into a higher-level one: process result → agent message → protocol response → session result → run outcome → exit code.
- **Functional core:** adapter output extraction, the protocol parser, and reporting are pure.
- **Imperative shell:** the process edge, input resolution (reads files, stdin and the filesystem) and the Session Runner (runs the child process) perform the side effects.
- **Two edges:** the agent adapter port, where agents plug in, and the process and I/O boundary at `cli`, where the real environment is bound.
- One cancellation signal runs from the process edge through every layer that waits on a child process.

## Project structure

| Path | Component |
|---|---|
| `src/cli.ts` | Process edge |
| `src/main.ts` | Composition root |
| `src/options.ts`, `src/prompt.ts`, `src/help.ts` | Input resolution |
| `src/agents/` | Agent adapters and registry |
| `src/run-loop.ts` | Run Loop |
| `src/session.ts`, `src/stderr-tail.ts` | Session Runner |
| `src/session-prompt.ts`, `src/harness.md` | Session Prompt |
| `src/protocol.ts` | Protocol Parser |
| `src/report.ts`, `src/exit-codes.ts` | Reporter |
| `src/outcomes.ts` | Outcome Model |
| `test/` | Unit tests per module, e2e tests that run the real CLI against fake agents (`test/fixtures/`) |

## Components

| Component | Responsibility |
|---|---|
| **Process edge** | Binds the real stdio, working directory and SIGINT (as an abort signal) to `main`. Nothing else touches the real process environment. |
| **Composition root** | Takes injected I/O, wires the components together, and returns an exit code. The only place that knows every component. |
| **Input resolution** | Turns arguments, files and stdin into validated options and a single prompt. Fails before any session starts. |
| **Agent Adapters** | One per supported agent. Translates neutral session settings into that agent's command line, and the agent's output into a final message. Pure and stateless. |
| **Agent Registry** | The single list of available adapters and the default. The source for validation, help, and tests. |
| **Run Loop** | Run policy: iterates sessions, decides when to retry, continue or stop, and produces the run outcome. Agent-agnostic. |
| **Session Runner** | Runs one session: builds the command via the adapter, runs the agent as a child process, classifies the result, and passes the final message to the protocol parser. The only component that combines an adapter with a process. |
| **Session Prompt** | Adds the harness instructions to the user's prompt: the loop workflow (one task per session) and response protocol from `src/harness.md`, and the instruction not to ask questions. |
| **Protocol Parser** | Validates the agent's final message against the harness protocol. |
| **Reporter** | All user-facing wording, status lines, and the mapping from run outcome to exit code. Never names a specific agent. |
| **Outcome Model** | The shared, agent-neutral vocabulary: session results, execution errors, run outcomes. |

Process control (timeouts, interruption, output capture) currently lives inside the Session Runner rather than in a component of its own. Extract it if a second consumer appears.

## Dependencies

```
 Process edge  (real stdio, SIGINT → abort signal)
       │
       ▼
 Composition root
   ├──► Input resolution ──► Agent Registry
   ├──► Session Prompt
   └──► Run Loop ──► Reporter
           │  (session function bound to an adapter)
           ▼
     Session Runner ──► Agent Adapter
           ├─────────► Protocol Parser
           ▼
     agent CLI (child process)

 All layers share the Outcome Model.
```

A run flows top-down. The composition root resolves an adapter from the registry and hands the Run Loop a session function bound to that adapter. Each iteration, the Session Runner launches the agent, asks the adapter to extract the final message, and has the Protocol Parser interpret it. The Run Loop acts on the resulting session result and reports through the Reporter. Interruption is the same abort signal throughout: the Run Loop checks it between sessions and the Session Runner uses it to stop a running agent.

Rules:

- Dependencies point from policy to mechanism; nothing depends on the composition root.
- Only the composition root, the registry users (input resolution, help), and the Session Runner know about agents. The Run Loop and Reporter never do. This is what keeps behaviour identical across agents.
- The Outcome Model is depended on by everything. Keep it stable and agent-neutral.

## Extension points

Adding an agent means writing one adapter and registering it. An adapter provides the command line and a classification of the agent's output (usable message, missing, invalid, or agent-reported error). If supporting an agent requires changing the Run Loop, Session Runner, Protocol Parser, or Reporter, the abstraction has leaked; fix that first.

## External dependencies

- **Agent CLIs** (i.e. `claude`, `codex`), launched as child processes. Adapters encode assumptions about their flags and output format.

## Security

`afk` has no sandbox of its own. It starts the agent in the chosen workspace with the agent's auto-approval mode enabled (`--permission-mode auto` for Claude, `--approve-for-me` for Codex) and no human in the loop. What the agent can do is limited only by that agent's own permissions and the user's account.

## Hotspots

- **External coupling to agent CLIs.** Test fakes copy the adapters' assumptions about output formats, so verify against the real CLI whenever an agent changes.
- **Adapter output classification.** The Session Runner trusts each adapter's classification of output as missing, invalid or agent-reported error, and it applies to non-zero exits as well as successful ones. An adapter that conflates them changes retry behaviour and diagnostics.
- **Protocol defined twice.** `src/harness.md` describes the response protocol in prose and the Protocol Parser enforces it. Change both together. No test currently ties them.
- **Run Loop mixes policy and presentation.** Acceptable at this size. If a machine-readable output mode is needed, have it emit events to the Reporter instead.
- **Process control inside the Session Runner.** Timeout, interruption and exit events race each other in the same function that classifies results. Change with care and keep the related tests green.
