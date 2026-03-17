import type { Command } from 'commander'

import commit from './commit.js'
import push from './push.js'
import changelog from './changelog.js'
import release from './release.js'
import sign from './sign.js'

export function registerGitCommands(program: Command) {
  // `gw commit` runs the wizard; `gw commit sign` runs the GPG setup
  const commitCmd = program
    .command('commit')
    .description('Interactive conventional commit wizard (feat/fix/chore/…)')
    .action(commit)

  commitCmd
    .command('sign')
    .description('Configure GPG signing for commits in the active workspace')
    .action(sign)

  program
    .command('push')
    .description('Push current branch, auto-set upstream, optionally open a PR')
    .action(push)

  program
    .command('changelog')
    .description('Generate or update CHANGELOG.md from conventional commit history')
    .action(changelog)

  program
    .command('release')
    .description('Bump semver version, tag, update changelog, and create a platform release')
    .action(release)
}
