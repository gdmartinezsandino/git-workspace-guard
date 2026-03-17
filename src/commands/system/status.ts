import chalk from 'chalk'
import { execa } from 'execa'

import { loadContext } from '../../core/context.js'

export default async function status() {
  const ctx = await loadContext()
  console.log(chalk.bold('\n🛡  Git Workspace Guard Status'))
  console.log('─'.repeat(40))

  if (!ctx.workspace) {
    console.log(chalk.red('❌ No active workspace. Run: gw workspace use <name>'))
    return
  }

  // Workspace Info
  console.log(`${chalk.blue('Active Workspace :')} ${chalk.bold(ctx.workspace.name)}`)
  console.log(`${chalk.blue('Git User         :')} ${ctx.workspace.userName} <${ctx.workspace.userEmail}>`)

  // 1. SSH Check based on Provider
  const provider = ctx.workspace.provider || 'github';
  const testHost = provider === 'bitbucket' ? 'bitbucket.org' : 'github.com';

  try {
    const { stderr, stdout } = await execa('ssh', ['-T', `git@${testHost}`, '-o', 'ConnectTimeout=2'], { reject: false });
    const output = stderr + stdout; // Combine both just in case

    // 2. Updated check to include Bitbucket's specific message
    const isAuthenticated = 
      output.includes('Hi') || 
      output.includes('successfully authenticated') || 
      output.includes('authenticated via ssh key'); // <--- BITBUCKET FIX

    if (isAuthenticated) {
      // 3. Regex updated to handle Bitbucket (which doesn't usually provide a username in the greeting)
      const user = output.match(/(?:Hi |logged in as )(.*?)[!.]/)?.[1] || 'Authenticated';
      console.log(`${chalk.blue('SSH Identity     :')} ${chalk.green('✅ ' + user)}`);
    } 
    else {
      console.log(`${chalk.blue('SSH Identity     :')} ${chalk.red('❌ Unauthenticated (' + testHost + ')')}`);
    }
  } 
  catch {
    console.log(`${chalk.blue('SSH Identity     :')} ${chalk.yellow('⚠️  Connection Timeout')}`);
  }

  console.log('─'.repeat(40) + '\n')
}
