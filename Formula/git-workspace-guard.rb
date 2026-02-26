class GitWorkspaceGuard < Formula
  desc "Identity Firewall for devs managing multiple Git identities"
  homepage "https://github.com/gdmartinezsandino/git-workspace-guard"
  url "https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/v1.0.0.tar.gz"
  
  # To get this value after tagging: curl -sL <url> | shasum -a 256
  sha256 "FILL_IN_AFTER_RELEASE"
  license "ISC"

  depends_on "node@22"

  def install
    system "npm", "ci"
    system "npm", "run", "build"
    system "npm", "prune", "--omit=dev"
    libexec.install Dir["*"]
    (bin/"gw").write <<~SH
      #!/usr/bin/env bash
      exec node "#{libexec}/dist/bin/gw.js" "$@"
    SH
  end

  test do
    assert_match "1.0.0", shell_output("#{bin}/gw --version")
  end
end
