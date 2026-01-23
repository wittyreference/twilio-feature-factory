#!/bin/bash
# ABOUTME: Placeholder hook for SubagentStop events.
# ABOUTME: Doc reminders now happen at pre-commit time, not here.

# Previously triggered doc-update-check.sh, but that fired at the wrong time
# (after exploration, before implementation). Now handled in pre-bash-validate.sh
# when git commit is detected.

exit 0
