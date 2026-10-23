# Glossary

- **Run**: one invocation of `afk`, made up of up to `--max-iterations` sessions.
- **Iteration**: one session launch, retries included.
- **Session**: one fresh agent process working on one task.
- **Task**: one unit of the feature, chosen by the agent.
- **Outcome**: the agent's protocol answer. `repeat` means more tasks remain, `complete` means the feature is done, `blocked` means a human is needed, and `fail` means this task failed but the run continues.
- **Execution error**: the agent could not produce a valid answer (launch failure, non-zero exit, missing or invalid response).
