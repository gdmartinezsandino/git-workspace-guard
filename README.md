
# 🛡️ Git Guard Workspace

A robust CLI tool to manage multiple Git identities and SSH keys on a single machine. It automatically prevents you from committing to the wrong project with the wrong identity by analyzing repository remotes.

---
## 🚀 Why this exists?

Standard Git makes it easy to accidentally commit to a **Work** repo using your **Personal** email, or vice-versa. Git Workspace Guard creates an "Identity Firewall" that validates your repository's remote namespace against your active profile.

---
## ✨ Features

-  **Smart Detection**: Automatically identifies if a repo belongs to an organization (e.g., `personal`, `work`) based on the URL.
-  **Identity Firewall**: Blocks commits if your active workspace doesn't match the repository's owner.
-  **SSH Key Management**: Automatically manages active identities so you never use the wrong key.
-  **Zero-Manual Config**: No more manual editing of `~/.zshrc` or `.gitconfig`. Use the CLI wizard.
-  **Global Protection**: Works across all your repositories via global Git hooks.

---
## 📁 Components

-  `~/.gw/config.json`: Centralized storage for all your workspace profiles.
-  `~/.gw/guard.sh`: The high-performance shell engine that validates identity during Git operations.
-  `~/.gw/hooks/`: Global Git hooks directory.
-  `~/.gw/state.json`: Tracks the currently active workspace.

---
## ⚙️ Installation

### Homebrew (recommended)

```bash
brew tap gdmartinezsandino/git-workspace-guard https://github.com/gdmartinezsandino/git-workspace-guard
brew install git-workspace-guard
```

### From source

1.  **Clone the repository**

```bash
git clone https://github.com/gdmartinezsandino/git-workspace-guard.git
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

---
## Usage

1.  **Add your workspaces**

Run the wizard for each identity (Personal, Work, etc.):

```bash
gw  workspace  add
```

**The wizard will ask for:**

-   **Workspace Name**: (e.g., `W_NAME1`, `W_NAME2`)
-   **Git Name & Email**: (e.g., `U_NAME`, `U_EMAIL`)
-   **SSH Key Path**: Path to the specific key for this profile.   
-   **Organization Keyword**: The name found in the Git URL (e.g., `TEAM_NAMESPACE` for Bitbucket or your username for GitHub).

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
Your  current  active  workspace  is: W_ACTIVE
This  repo  is  linked  to  TEAM_NAMESPACE
👉  Run:  gw  use  personal
```

---
## 🔒 What this protects you from

-   ✅ **Email Leaks**: Prevents using a personal email for company commits.
-   ✅ **Remote Mismatch**: Blocks operations if you are in the wrong "context."
-   ✅ **SSH Identity Errors**: Ensures the correct key is always prioritized.

---
## 🧩 Husky Compatibility

If a repository uses Husky, it may override global hooks. To maintain protection, add this to the top of your `.husky/pre-commit` file:

```bash
if [ -x "$HOME/.gw/guard.sh" ]; then
  "$HOME/.gw/guard.sh" || exit  1
fi
```
---
## 🔗 Clone with the right identity

Instead of `git clone`, use `gw workspace clone` to automatically match the repo to the correct workspace:

```bash
gw workspace clone git@github.com:mycompany/myrepo.git
# or HTTPS
gw workspace clone https://github.com/mycompany/myrepo.git
```

The tool will:
- Detect the right workspace from the repository namespace (matched against `orgs`)
- Rewrite the clone URL to use your workspace's SSH alias
- Set local `git config user.name` and `git config user.email` in the cloned repo
- Switch your active workspace automatically

If no workspace matches the namespace, you'll be prompted to choose one.

---
## 🚀 Creating Pull Requests

`gw pr create` opens a PR/MR against GitHub, Bitbucket, or GitLab using your active workspace's credentials.

### 1. Add an API token to your workspace

```bash
gw workspace edit <name>
```

Fill in the **API token** field at the end of the wizard. The format depends on the provider:

---

#### GitHub

Create a **Fine-grained Personal Access Token** at:
**github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens**

Required permissions:
- **Pull requests**: Read and Write
- **Metadata**: Read (selected automatically)

```
ghp_xxxxxxxxxxxx
# or fine-grained:
github_pat_xxxxxxxxxxxx
```

Enter just the token — no username prefix needed.

---

#### GitLab

Create a **Personal Access Token** at:
**gitlab.com → Preferences → Access tokens**

Required scope: `api`

```
glpat-xxxxxxxxxxxx
```

Enter just the token — no username prefix needed.

---

#### Bitbucket

> ⚠️ App Passwords were deprecated in September 2025. Use **API tokens** instead.

Create an **API Token** at:
**bitbucket.org → Personal settings → API tokens**

Required scopes:
- `read:repository:bitbucket`
- `read:pullrequest:bitbucket`
- `write:pullrequest:bitbucket`

Bitbucket's REST API requires **Basic auth**, so the token must be stored as `email:token`:

```
your@email.com:ATATT3xxxxxxxxxxxxxxxxxxx
```

Use the email address associated with your Bitbucket account and the full API token as the password.

---

### 2. (Optional) Create a PR template

Templates can be defined at two levels:

| Location | Scope |
|----------|-------|
| `.git-templates/pr.md` in your project root | Per-project (takes priority) |
| `~/.gw/pr-template.md` | Global fallback for all repos |

Example template:

```markdown
## Description
{{branch}} → {{base}}

## Changes
-

## Testing
-
```

**Available variables** (replaced automatically):

| Variable | Value |
|----------|-------|
| `{{branch}}` | Current branch name |
| `{{base}}` | Target/base branch |
| `{{repo}}` | Repository name |
| `{{workspace}}` | Active workspace name |

> The `.git-templates/` folder is designed to hold multiple template types in the future (e.g., commit messages, issue descriptions). Only `pr.md` is used today.

---

### 3. Create the PR

```bash
gw pr create
```

You'll be prompted for title, base branch, and whether to open as draft (GitHub/GitLab only). The PR URL is shown at the end and can be opened in your browser directly.

---
## Philosophy

This tool follows the **Local Dev Platform** pattern. It wraps your existing Git workflow with a layer of identity awareness, ensuring that you remain compliant with security policies without sacrificing developer experience.
