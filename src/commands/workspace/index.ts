import type { Command } from 'commander'

import add from './add.js'
import doctor from './doctor.js'
import use from './use.js'
import list from './list.js'
import show from './show.js'
import edit from './edit.js'
import remove from './remove.js'

export function registerWorkspaceCommands(program: Command) {
  const workspace = program.command('workspace').description('Workspace commands')

  workspace
    .command('add')
    .description('Create a new workspace profile')
    .action(add)

  workspace
    .command('doctor <name>')
    .description('Run checks for workspace')
    .action(doctor)

  workspace
    .command('use <name>')
    .description('Switch to a workspace')
    .action(use)

  workspace
    .command('edit <name>')
    .description('Edit an existing workspace')
    .action(edit)

  workspace
    .command('list')
    .description('List all available workspaces')
    .action(list)

  workspace
    .command('remove <name>')
    .description('Delete a workspace')
    .action(remove)

  workspace
    .command('show <name>')
    .description('Show details of a workspace')
    .action(show)

  workspace
    .command('use <name>')
    .description('Switch to a workspace')
    .action(use)
}
