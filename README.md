# 🛡️ Git Workspace Guard

A lightweight local setup to safely manage multiple companies / identities on the same machine.

This system allows you to:

 - Switch between company workspaces with one command
 - Automatically change Git identity (name + email)
 - Enforce confirmation before every git commit and git push
 - Prevent accidental commits or pushes with the wrong profile
 - Work globally across all repositories

## ✨ Features
 - set_workspace `company` command
 - Global Git hooks (`pre-commit`, `pre-push`
 - Mandatory workspace selection
 - Interactive confirmation before commit/push
 - Works with any Git repository
 - Compatible with Husky (via hook chaining)
  
### 📁 Components
 - `~/.git-workspace` → stores the active workspace
 - `~/.git-hooks/pre-commit` → commit protection
 - `~/.git-hooks/pre-push` → push protection
 - `set_workspace` → shell function to switch identity

### ⚙️ Installation

1️⃣ Create a global Git hooks directory

    mkdir -p ~/.git-hooks
    
    git config --global core.hooksPath ~/.git-hooks
    
Restart your terminal after this.

2️⃣ Create the set_workspace command

Add this to your  `~/.zshrc` (or `~/.bashrc`):

    # Colors for output
    
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
     
    set_workspace() {
	    PROFILE="$1"
	    if [ -z  "$PROFILE" ]; then
		    echo  "${RED}Usage: set_workspace <company>${NC}"
		    return  1
	    fi
	    
	    case  "$PROFILE"  in
	 		    personal)
				    NAME=YOUR_NAME
				    EMAIL="[EMAIL]"
				    SSH_KEY="$HOME/.ssh/id_rsa_personal"
				    SSH_HOST="personal-github"
				    ;;

          # OTHER COMPANIES
    
			    *)
				    echo  "${YELLOW}Unknown workspace: $PROFILE${NC}"
				    return  1
				    ;;
    
		 esac
   
	    # Git identity
	    git  config  --global  user.name  "$NAME"
	    git  config  --global  user.email  "$EMAIL"
    
	    # Save active profile
	    echo  "$PROFILE"  >  ~/.git-workspace
   
	    # Export SSH command globally for this shell
		  export  GIT_SSH_COMMAND="ssh -i $SSH_KEY -o IdentitiesOnly=yes"
	
	    echo  "${GREEN}✅ Workspace set to: $PROFILE${NC}"
	    echo  " 👤 $NAME <$EMAIL>"
	    echo  " 🔑 $SSH_KEY"
	 }

Reload your shell:  

    source ~/.zshrc

3️⃣ Create the pre-commit hook

*~/.git-hooks/pre-commit*


    #!/bin/bash

    # Colors for output
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
 
    ACTIVE=$(cat  ~/.git-workspace  2>/dev/null)
    if [ -z  "$ACTIVE" ]; then
	    echo  "${RED}❌ No active workspace. Run: set_workspace <company>${NC}"
	    exit  1 
    fi
   
    EMAIL=$(git  config  --global  user.email)
    
    echo  ""
    echo  "${YELLOW}📝 Git commit detected${NC}"
    echo  "👤 Workspace: $ACTIVE"
    echo  "📧 Email: $EMAIL" 
    echo  ""
   
    read  -p  "${YELLOW}Continue commit? (y/n): ${NC}"  confirm  <  /dev/tty
        
    if [[ "$confirm"  !=  "y" ]]; then
	    echo  "${RED}❌ Commit cancelled${NC}"
	    echo  ""
	    echo  "To set a workspace use: set_workspace [name]"
	    echo  ""
	    exit  1
    fi

save the pre-hook, and set the permissions

    chmod +x ~/.git-hooks/pre-commit

4️⃣ Create the pre-push hook

*~/.git-hooks/pre-push*

    #!/bin/bash
    
    # Colors for output
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'   
    NC='\033[0m'
 
    ACTIVE=$(cat  ~/.git-workspace  2>/dev/null)
    if [ -z  "$ACTIVE" ]; then
	    echo  "${RED}❌ No active workspace. Run: set_workspace <company>${NC}"
	    exit  1
    fi
    
    EMAIL=$(git  config  --global  user.email)
    echo  "${YELLOW}🚀 Pushing as [$ACTIVE] <$EMAIL>${NC}"
    echo  "👤 Workspace: $ACTIVE"
    echo  "📧 Email: $EMAIL"
        
    read  -p  "${YELLOW}Continue push? (y/n): ${NC}"  confirm  <  /dev/tty

    if [[ "$confirm"  !=  "y" ]]; then
	    echo  "${RED}❌ Push cancelled${NC}"
	    echo  ""
	    echo  "To set a workspace use: set_workspace [name]"
	    echo  ""
	    exit  1
    fi

 Save the pre-hook, and set the permissions

    chmod +x ~/.git-hooks/pre-push

## 🧪 Usage

Set active workspace

    set_workspace personal

**Output:**

    ✅ Workspace set to: personal
    👤 [NAME] <[EMAIL]@[COMPANY].com>
    🔑 /Users/.../id_rsa_personal

### Commit

    git commit -m "Add login flow"
    
    📝 Git commit detected
    👤 Workspace: [COMPANY]
    📧 Email: [EMAIL]@[COMPANY].com
    
    Continue commit? (y/n):

  

### Push

    git push origin main
    
    🚀 Git push detected
    👤 Workspace: aaamb
    📧 Email: [EMAIL]

    Continue push? (y/n):


## 🔒 What this protects you from
❌ Pushing with the wrong SSH key
❌ Committing with the wrong company email
❌ Forgetting which workspace you’re in
❌ Cross-company mistakes

## 🧠 Philosophy

This setup does not replace Git.

It wraps your local environment with identity awareness and safety rails.

Exactly how internal dev platforms are built.


### 🧩 Husky compatibility

If a repository uses Husky, it overrides global hooks. To chain this guard into Husky:

Edit: `.husky/pre-commit`. Add at the top:

*.husky/pre-push*

    if [ -x "$HOME/.git-hooks/pre-commit" ]; then
	    "$HOME/.git-hooks/pre-commit" || exit 1    
    fi

    or for push:
   
    if [ -x "$HOME/.git-hooks/pre-push" ]; then
	    "$HOME/.git-hooks/pre-push" || exit 1
    fi

This preserves Husky while enforcing your global workspace protection.
