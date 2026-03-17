import type { Command } from 'commander'
import issueCreate from './create.js'

export function registerIssueCommands(program: Command) {
  const issue = program.command('issue').description('Issue management commands')

  issue
    .command('create')
    .description('Create a new issue on GitHub, GitLab, or Bitbucket')
    .option('-t, --title <title>', 'Issue title (skips prompt)')
    .option('-b, --body <body>', 'Issue description / body (skips prompt)')
    .option('--no-open', 'Do not open in browser after creation (skips prompt)')
    .action(issueCreate)
}
