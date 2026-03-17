import type { Command } from 'commander'

import branchCreate from './create.js'
import branchCleanup from './cleanup.js'
import branchList from './list.js'

export function registerBranchCommands(program: Command) {
  const branch = program
    .command('branch')
    .description('Branch management utilities')

  branch
    .command('create')
    .description('Create a branch following the workspace naming convention (type/TICKET-description)')
    .action(branchCreate)

  branch
    .command('cleanup')
    .description('Delete all local branches already merged into main/develop')
    .action(branchCleanup)

  branch
    .command('list')
    .description('List local branches with their PR/MR status from the provider')
    .action(branchList)
}
