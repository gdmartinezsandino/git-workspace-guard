import { config } from '../../core/config.js'

export default async function show(name: string) {
  const ws = config.get('workspaces')[name];

  if (!ws) {
    console.error(`❌ Workspace "${name}" not found.`);
    return;
  }

  console.log(`\n--- Workspace: ${name} ---`);
  console.log(`👤 Name:   ${ws.userName}`);
  console.log(`📧 Email:  ${ws.userEmail}`);
  console.log(`🔑 Key:    ${ws.sshKey}`);
  console.log(`🏢 Orgs:   ${ws.orgs?.join(', ') || 'None'}`);
  console.log(`🌐 Provider: ${ws.provider}\n`);
}
