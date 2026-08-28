# Security policy

## Reporting a vulnerability

Do not open a public issue for credential exposure or authentication flaws.
Use GitHub private vulnerability reporting for this repository.

## Credential model

Claudeland does not implement its own browser login and does not store a copy
of Claude credentials. It delegates login to the installed Claude Code CLI and
reads the existing local credential only when making a usage request.

The credential can authorize more than read-only usage checks. Anyone able to
execute code as your desktop user can generally read the same credential, so
install extensions only from sources you trust.

Never attach `~/.claude/.credentials.json`, GNOME Shell logs containing account
data, or an unredacted API response to a bug report.
