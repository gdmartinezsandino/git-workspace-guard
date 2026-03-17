import type { Command } from 'commander'
import issueCreate from './create.js'

export function registerIssueCommands(program: Command) {
  const issue = program.command('issue').description('Issue management commands')

  issue
    .command('create')
    .description('Create a new issue on GitHub, GitLab, or Bitbucket')
    .action(issueCreate)
}
