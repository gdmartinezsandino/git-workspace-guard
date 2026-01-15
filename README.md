
# 🛡️ Git Guard

A robust CLI tool to manage multiple Git identities and SSH keys on a single machine. It automatically prevents you from committing to the wrong project with the wrong identity by analyzing repository remotes.


## 🚀 Why this exists?

Standard Git makes it easy to accidentally commit to a **Work** repo using your **Personal** email, or vice-versa. Git Workspace Guard creates an "Identity Firewall" that validates your repository's remote namespace against your active profile.


## ✨ Features

-  **Smart Detection**: Automatically identifies if a repo belongs to an organization (e.g., `personal`, `work`) based on the URL.
-  **Identity Firewall**: Blocks commits if your active workspace doesn't match the repository's owner.
-  **SSH Key Management**: Automatically manages active identities so you never use the wrong key.
-  **Zero-Manual Config**: No more manual editing of `~/.zshrc` or `.gitconfig`. Use the CLI wizard.
-  **Global Protection**: Works across all your repositories via global Git hooks.

## 📁 Components

-  `~/.gw/config.json`: Centralized storage for all your workspace profiles.
-  `~/.gw/guard.sh`: The high-performance shell engine that validates identity during Git operations.
-  `~/.gw/hooks/`: Global Git hooks directory.
-  `~/.gw/state.json`: Tracks the currently active workspace.
---  

## ⚙️ Installation


1.  **Clone the repository**

```bash
git clone <your-repo-url> git-workspace-guard
cd git-workspace-guard
```

2.  **Run the installer**

```bash
chmod +x install.sh
./install.sh
```

3.  **Restart your terminal or run**

```bash
source ~/.zshrc
```  

## Usage

1.  **Add your workspaces**

Run the wizard for each identity (Personal, Work, etc.):

```bash
gw  workspace  add
```

**The wizard will ask for:**

-   **Workspace Name**: (e.g., `personal`, `aaamb`)
-   **Git Name & Email**: (e.g., `Gabriel Martinez`, `gabriel@aaamb.com`)
-   **SSH Key Path**: Path to the specific key for this profile.   
-   **Organization Keyword**: The name found in the Git URL (e.g., `aaambcode` for Bitbucket or your username for GitHub).

2.  **Switch Workspaces**

```bash
gw workspace use personal
```

**Output:**

```bash
✅  Workspace  WORKSPACE_NAME  active
👤  WORKSPACE_USER_NAME <WORKSPACE_USER_EMAIL>
🔑  ~/keys/id_rsa_WORKSPACE_NAME
```

3.  **The Guard in Action**

If you try to commit to a **Personal** repo while the **Work** workspace is active:

```bash
git  commit  -m  "Update login logic"
```

**Output:**

```bash
🛡  Git  Workspace  Guard
❌  Workspace  Mismatch!
Your  current  active  workspace  is:  aaamb
This  repo  is  linked  to  gdmartinezsandino
👉  Run:  gw  use  personal
```

## 🔒 What this protects you from

-   ✅ **Email Leaks**: Prevents using a personal email for company commits.
-   ✅ **Remote Mismatch**: Blocks operations if you are in the wrong "context."
-   ✅ **SSH Identity Errors**: Ensures the correct key is always prioritized.

## 🧩 Husky Compatibility

If a repository uses Husky, it may override global hooks. To maintain protection, add this to the top of your `.husky/pre-commit` file:

```bash
if [ -x "$HOME/.gw/guard.sh" ]; then
  "$HOME/.gw/guard.sh" || exit  1
fi
```
  
## Philosophy

This tool follows the **Local Dev Platform** pattern. It wraps your existing Git workflow with a layer of identity awareness, ensuring that you remain compliant with security policies without sacrificing developer experience.
