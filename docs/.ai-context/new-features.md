## PR/issue management
- gw pr list — list open PRs for the current repo, shown in terminal
- gw pr merge — merge a PR by number from the CLI
- gw issue create — create a GitHub/Bitbucket issue with a template from .git-templates/issue.md

## Repository operations
- gw workspace clone-all — clone all repos from an org using the correct SSH alias
- gw workspace sync — pull latest on the default branch across all your cloned repos for a workspace


## Identity & security
- gw doctor — already exists, but could be extended to verify token validity, SSH key connectivity, and hook installation all at once
- gw commit sign — configure GPG signing per workspace so commits are verified on GitHub

## Command autocompleting
- the idea would be have an autocomplete during the typing in terminal
