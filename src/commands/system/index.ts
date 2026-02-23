import type { Command } from 'commander'

import init from './init.js'
import doctor from './doctor.js'
import whoami from './whoami.js'
import status from './status.js'

export function registerSystemCommands(program: Command) {
  const system = program.command('system').description('System commands')

  system.command('init').description('Install guard system').action(init)
  system.command('doctor').description('Run system diagnostics').action(doctor)
  system.command('whoami').description('Show current identity').action(whoami)
  system.command('status').description('Show current status').action(status)
}
