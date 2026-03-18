class GitWorkspaceGuard < Formula
  desc "Identity Firewall for devs managing multiple Git identities"
  homepage "https://github.com/gdmartinezsandino/git-workspace-guard"
  url "https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/v1.0.10.tar.gz"
  # curl -sL https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/v1.0.10.tar.gz | shasum -a 256
  sha256 "6ca57d5ad634325e9c8b2e39d36b0d7b8efaca82c00b9813889dd14b6cb56121"
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
    assert_match "1.0.10", shell_output("#{bin}/gw --version")
  end
end
