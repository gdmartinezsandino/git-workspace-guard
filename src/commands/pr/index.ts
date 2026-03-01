import type { Command } from 'commander'
import create from './create.js'
import list from './list.js'
import merge from './merge.js'

export function registerPrCommands(program: Command) {
  const pr = program.command('pr').description('Pull request commands')

  pr.command('create')
    .description('Create a pull request for the current branch')
    .action(create)

  pr.command('list')
    .description('List open pull requests for the current repo')
    .action(list)

  pr.command('merge [number]')
    .description('Merge a pull request (select interactively or pass PR number)')
    .action(merge)
}
