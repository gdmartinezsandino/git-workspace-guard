import type { Command } from 'commander'

import commit from './commit.js'
import push from './push.js'
import changelog from './changelog.js'

export function registerGitCommands(program: Command) {
  program
    .command('commit')
    .description('Interactive conventional commit wizard (feat/fix/chore/…)')
    .action(commit)

  program
    .command('push')
    .description('Push current branch, auto-set upstream, optionally open a PR')
    .action(push)

  program
    .command('changelog')
    .description('Generate or update CHANGELOG.md from conventional commit history')
    .action(changelog)
}
