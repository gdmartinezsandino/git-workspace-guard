// src/commands/system/whoami.ts
import { execa } from 'execa'
import chalk from 'chalk'
import { loadContext } from '../../core/context.js'

export default async function whoami() {
  console.log(chalk.cyan('\n👤 Git Identity\n'))
  
  const ctx = await loadContext()
  
  // 1. Check Git Config
  const { stdout: name } = await execa('git', ['config', 'user.name']).catch(() => ({ stdout: 'Not set' }))
  const { stdout: email } = await execa('git', ['config', 'user.email']).catch(() => ({ stdout: 'Not set' }))
  
  console.log(`${chalk.blue('Git user.name  :')} ${name}`)
  console.log(`${chalk.blue('Git user.email :')} ${email}`)

  // 2. Check SSH Identity (The real truth)
  console.log(chalk.blue('\n🔑 SSH Identity check...'))
  
  const provider = ctx.workspace?.provider || 'github';
  const testHost = provider === 'bitbucket' ? 'bitbucket.org' : 'github.com';

  try {
    const { stderr, stdout } = await execa('ssh', ['-T', `git@${testHost}`, '-o', 'ConnectTimeout=5', '-o', 'StrictHostKeyChecking=no'], { reject: false });
    const output = stderr + stdout;
    
    const isAuthenticated = 
      output.includes('Hi') || 
      output.includes('successfully authenticated') || 
      output.includes('authenticated via ssh key'); // <--- BITBUCKET FIX

    if (isAuthenticated) {
      let user = output.match(/(?:Hi |logged in as )(.*?)[!.]/)?.[1] || '';
      if (!user || user.trim() === '') {
        user = ctx.workspace?.name || 'Authenticated User';
      }
      console.log(`${chalk.green('✅ Authenticated as:')} ${chalk.bold(user)} (${provider})`);
    } else {
      console.log(chalk.red(`❌ Not authenticated on ${testHost}`));
    }
  }
  catch {
    console.log(chalk.red(`❌ SSH check failed for ${testHost}`));
  }

  console.log('')
}
