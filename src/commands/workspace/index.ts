import type { Command } from 'commander'

import add from './add.js'
import use from './use.js'
import list from './list.js'

export function registerWorkspaceCommands(program: Command) {
  const workspace = program.command('workspace').description('Workspace commands')

  workspace.command('add').description('Add a workspace').action(add)
  workspace.command('use <name>').description('Use a workspace').action(use)
  workspace.command('list').description('List workspaces').action(list)
}
