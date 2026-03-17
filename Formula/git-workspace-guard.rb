class GitWorkspaceGuard < Formula
  desc "Identity Firewall for devs managing multiple Git identities"
  homepage "https://github.com/gdmartinezsandino/git-workspace-guard"
  url "https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/v1.0.9.tar.gz"
  # curl -sL https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/v1.0.9.tar.gz | shasum -a 256
  sha256 "877f53f6a3a7934e7d013b6a4ea072ef8d12eef9ef7a0ba39ecefcc732d290eb"
  license "ISC"

  depends_on "node@22"

  def install
    system "npm", "ci"
    system "npm", "run", "build"
    system "npm", "prune", "--omit=dev"
    libexec.install "dist", "node_modules", "package.json"
    node_bin = "#{Formula["node@22"].opt_bin}/node"
    (bin/"gw").write <<~SH
      #!/usr/bin/env bash
      exec "#{node_bin}" "#{libexec}/dist/bin/gw.js" "$@"
    SH
  end

  test do
    assert_match "1.0.9", shell_output("#{bin}/gw --version")
  end
end
