class GitWorkspaceGuard < Formula
  desc "Identity Firewall for devs managing multiple Git identities"
  homepage "https://github.com/gdmartinezsandino/git-workspace-guard"
  url "https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/v1.0.0.tar.gz"
  
  # After tagging v1.0.0, run this to get the value:
  # curl -sL https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/v1.0.0.tar.gz | shasum -a 256
  sha256 "e44e5710a7eb3473a577b126066a3e86991c1f63478106cf6b0dc5f2491bd054"
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
