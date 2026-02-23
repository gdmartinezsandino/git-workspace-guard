import { Command } from 'commander'
import { registerSystemCommands } from './commands/system/index.js'
import { registerWorkspaceCommands } from './commands/workspace/index.js'
import { registerPrCommands } from './commands/pr/index.js'

const program = new Command()

program
  .name('gw')
  .description('Git Workspace Guard CLI')
  .version('0.1.0')

registerSystemCommands(program)
registerWorkspaceCommands(program)
registerPrCommands(program)

program.parse()
