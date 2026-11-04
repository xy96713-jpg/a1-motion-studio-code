# Materials lock recovery

`materials/.lock` is a cooperative lock on a local filesystem. Only its owner removes it during normal operation; all same-UID material workers and operators must respect this rule. The token and inode checks detect ordinary ownership changes but the check and unlink are not an atomic transaction and do not protect against an external process replacing the file. Empty, malformed, legacy PID-only, apparently dead-PID, and permission-unknown locks are never reclaimed automatically. A PID check, age, or timeout alone cannot prove safety. Acquisition timeout reports the path and observed content.

To recover a stale lock manually:

1. Quiesce the entire relevant execution environment: prevent new project material workers from starting, and wait for all existing workers/callers (including both shotplan passages and library preparation, and any older-version workers) to finish. Inspect running processes and any other hosts sharing the project. Do not kill a worker merely because a timeout elapsed. If you cannot establish that no worker can be holding or acquiring the lock, do not remove it.
2. While the environment remains quiesced, inspect the exact `<project>/materials/.lock` and its containing project path; save the contents for diagnosis. Empty or dead-PID content is not by itself proof of quiescence.
3. Once no worker is holding or can acquire it, remove that exact file manually (`rm -- '<absolute project path>/materials/.lock'`), then verify it is absent. Resume the stopped scheduler/workers only after that. Never run cleanup concurrently with workers or another cleanup.

A process crash or an error writing the owner record may leave an empty/partial lock; the same procedure applies. This procedure assumes trusted cooperating same-UID processes and a filesystem providing exclusive create; it is not a distributed or adversarial locking guarantee.
