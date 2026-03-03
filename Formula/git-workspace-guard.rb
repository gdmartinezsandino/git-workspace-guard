class GitWorkspaceGuard < Formula
  desc "Identity Firewall for devs managing multiple Git identities"
  homepage "https://github.com/gdmartinezsandino/git-workspace-guard"
  url "https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/v1.0.7.tar.gz"
  # curl -sL https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/v1.0.7.tar.gz | shasum -a 256
  sha256 "2912f5ba5a957185dc6982c2c60fd4f2b376cecd5b86be329d4c861f106ed419"
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
    assert_match "1.0.7", shell_output("#{bin}/gw --version")
  end
end
