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
    .option('-t, --type <type>', 'Commit type: feat|fix|chore|docs|refactor|test|style|perf (skips prompt)')
    .option('-s, --scope <scope>', 'Scope, e.g. auth, api (skips prompt)')
    .option('-m, --message <description>', 'Commit description (skips prompt)')
    .option('--body <body>', 'Commit body / extended description (skips prompt)')
    .option('-a, --all', 'Stage all changes first (git add -A)')
    .option('-y, --yes', 'Skip the final confirmation prompt')
    .action(commit)

  commitCmd
    .command('sign')
    .description('Configure GPG signing for commits in the active workspace')
    .action(sign)

  program
    .command('push')
    .description('Push current branch, auto-set upstream, optionally open a PR')
    .option('--no-pr', 'Skip the "create PR?" prompt after pushing')
    .action(push)

  program
    .command('changelog')
    .description('Generate or update CHANGELOG.md from conventional commit history')
    .action(changelog)

  program
    .command('release')
    .description('Bump semver version, tag, update changelog, and create a platform release')
    .option('--patch', 'Bump patch version x.x.X (skips version prompt)')
    .option('--minor', 'Bump minor version x.X.0 (skips version prompt)')
    .option('--major', 'Bump major version X.0.0 (skips version prompt)')
    .option('--version <v>', 'Set explicit version e.g. 2.1.0 (skips version prompt)')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .option('--no-push', 'Skip pushing commits and tag to origin')
    .action(release)
}
