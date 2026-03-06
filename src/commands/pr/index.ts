import type { Command } from 'commander'
import create from './create.js'
import list from './list.js'
import merge from './merge.js'

export function registerPrCommands(program: Command) {
  const pr = program.command('pr').description('Pull request commands')

  pr.command('create')
    .description('Create a pull request for the current branch')
    .option('-t, --title <title>', 'PR title (skips prompt)')
    .option('-b, --target <branch>', 'Target/base branch (skips prompt)')
    .option('-d, --draft', 'Create as draft PR (skips prompt)')
    .option('--no-open', 'Do not open in browser after creation (skips prompt)')
    .action(create)

  pr.command('list')
    .description('List open pull requests for the current repo')
    .action(list)

  pr.command('merge [number]')
    .description('Merge a pull request (select interactively or pass PR number)')
    .action(merge)
}
