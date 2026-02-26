class GitWorkspaceGuard < Formula
  desc "Identity Firewall for devs managing multiple Git identities"
  homepage "https://github.com/gdmartinezsandino/git-workspace-guard"
  url "https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/v1.0.2.tar.gz"
  # curl -sL https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/v1.0.0.tar.gz | shasum -a 256
  sha256 "547cfa114b65444ded795add29aa0c174ea43043792f914ce24ea6969e8eff69"
  license "ISC"

  depends_on "node@22"

  def install
    system "npm", "ci"
    system "npm", "run", "build"
    system "npm", "prune", "--omit=dev"
    libexec.install Dir["*"]
    node_bin = "#{Formula["node@22"].opt_bin}/node"
    (bin/"gw").write <<~SH
      #!/usr/bin/env bash
      exec "#{node_bin}" "#{libexec}/dist/bin/gw.js" "$@"
    SH
  end

  test do
    assert_match "1.0.2", shell_output("#{bin}/gw --version")
  end
end
