# Project Instructions

## Git Commit Rules

- **Never commit without asking the user first.** Always show the list of files to be committed and ask for explicit confirmation before running any `git commit` command.
- **Never commit the `.env` file** under any circumstances. It contains secrets (API keys, credentials). If `.env` is staged, remove it from staging and warn the user before proceeding.
- Make sure `.env` is listed in `.gitignore`. If it is not, add it.
