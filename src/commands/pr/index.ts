import type { Command } from 'commander'
import create from './create.js'

export function registerPrCommands(program: Command) {
  const pr = program.command('pr').description('Pull request commands')

  pr.command('create')
    .description('Create a pull request for the current branch')
    .action(create)
}
