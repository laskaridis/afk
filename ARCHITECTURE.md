# Architecture

`afk` runs a coding agent unattended, one task per fresh session, until the agent reports that the work is complete or blocked, or a run limit is reached. It is a thin, agent-neutral harness: what the user sees and every policy decision are the same whichever agent runs.

## Style

A **layered pipeline** with a **functional core** and a single **ports-and-adapters** edge.

- Each layer turns a lower-level result into a higher-level one: process result → agent message → protocol response → session result → run outcome → exit code.
- The coding agent is the only thing that varies. It sits behind the agent adapter port. Every other part of the harness is fixed.
- Pure logic (adapters, protocol, reporting) is kept apart from side effects (process control, I/O).

## Components

| Component | Responsibility |
|---|---|
| **CLI / Composition root** | Parses input, resolves the selected agent, wires the components together, and maps the final outcome to an exit code. The only place that knows every component. |
| **Agent Adapters** | One per supported agent. Translates neutral session settings into that agent's command line, and the agent's output into a final message. Pure and stateless. |
| **Agent Registry** | The single list of available adapters and the default. The source for validation, help, and tests. |
| **Run Loop** | Run policy: iterates sessions, applies the retry and stop rules, and produces the run outcome. Agent-agnostic. |
| **Session Runner** | Runs one session: builds the command via the adapter, runs it, classifies the result, and passes the final message to the protocol parser. The only component that combines an adapter with a process. |
| **Process Runner** | Runs one child process: stdin, captured output, timeout, and interruption. Knows nothing about agents or the protocol. |
| **Protocol Parser** | Validates the agent's final message against the harness protocol (repeat / complete / blocked / fail). |
| **Reporter** | All user-facing wording and status lines. Never names a specific agent. |
| **Outcome Model** | The shared, agent-neutral vocabulary: session results, execution errors, run outcomes. |

## Dependencies and interactions

```
             CLI / Composition root
             │            │           │
             ▼            ▼           ▼
       Agent Registry   Run Loop ──► Reporter
             │            │ (session runner as a function)
             ▼            ▼
       Agent Adapters ◄─ Session Runner ──► Protocol Parser
                          │
                          ▼
                    Process Runner

  All layers share the Outcome Model.
```

A run flows top-down. The composition root resolves an adapter from the registry and hands the Run Loop a session function bound to that adapter. Each iteration, the Session Runner asks the adapter for arguments, has the Process Runner execute the agent, asks the adapter to extract the final message, and has the Protocol Parser interpret it. The Run Loop acts on the resulting session result and reports through the Reporter.

Rules:

- Dependencies point from policy to mechanism; nothing depends on the composition root.
- Only the composition root, the registry users (input parsing, help), and the Session Runner know about agents. The Run Loop and Reporter never do. This is what keeps behaviour identical across agents.
- The Process Runner has no project dependencies.
- The Outcome Model is depended on by everything. Keep it stable and agent-neutral.

## Extension point

Adding an agent means writing one adapter and registering it. If supporting an agent requires changing the Run Loop, Session Runner, Process Runner, Protocol Parser, or Reporter, the abstraction has leaked; fix that first.

## Hotspots

- **External coupling to agent CLIs.** Adapters encode assumptions about each agent's output format. Test fakes copy the same assumptions, so verify against the real CLI whenever an agent changes.
- **Implicit adapter contract.** The Session Runner calls the adapter's message extraction only after a successful exit, and it handles empty messages itself. Adapters must not duplicate that logic.
- **Run Loop mixes policy and presentation.** Acceptable at this size. If a machine-readable output mode is needed, have it emit events to the Reporter instead.
- **Process lifecycle.** Timeout, interruption, and exit events race each other. Change with care and keep the related tests green.
