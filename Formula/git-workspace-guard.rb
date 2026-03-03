class GitWorkspaceGuard < Formula
  desc "Identity Firewall for devs managing multiple Git identities"
  homepage "https://github.com/gdmartinezsandino/git-workspace-guard"
  url "https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/v1.0.8.tar.gz"
  # curl -sL https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/v1.0.8.tar.gz | shasum -a 256
  sha256 "11052b710501374d5c870101df435e2757f9855b310715fc24ef087f21c0d85c"
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
    assert_match "1.0.8", shell_output("#{bin}/gw --version")
  end
end
