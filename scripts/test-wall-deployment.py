from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("deploy_wall", ROOT / "scripts/deploy-wall-api.py")
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

# Default preview cannot read a key file or run any cloud command.
output = io.StringIO()
with patch.object(deploy, "apply", side_effect=AssertionError("unexpected deployment")):
    with redirect_stdout(output):
        deploy.main(["--teacher-email", "teacher@example.edu", "--env-file", "/does/not/exist"])
preview = json.loads(output.getvalue())
assert preview["applyRequested"] is False
assert preview["deploymentPlan"]["maxInstances"] == 1
assert preview["deploymentPlan"]["minInstances"] == 0
assert preview["deploymentPlan"]["secretHandling"].startswith("Secret Manager")
with redirect_stderr(io.StringIO()):
    try:
        deploy.arguments(["--teacher-email", "teacher|other@example.edu"])
        raise AssertionError("Environment-list delimiter accepted in a teacher email")
    except SystemExit as error:
        assert error.code == 2

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    env = root / ".env"
    # A synthetic fixture literal; never an account credential.
    fake_key = "sk-test-fixture-not-a-real-credential"
    env.write_text("OPENAI_API_KEY=" + fake_key + "\n")
    args = deploy.arguments(["--teacher-email", "teacher@example.edu", "--env-file", str(env), "--apply"])
    cloud_calls = []
    def disabled_billing(*cmd, **kwargs):
        cloud_calls.append(cmd)
        if cmd[:2] == ("auth", "list"): return subprocess.CompletedProcess(cmd, 0, b"teacher@example.edu\n", b"")
        if cmd[:3] == ("billing", "projects", "describe"): return subprocess.CompletedProcess(cmd, 0, b'{"billingEnabled":false}', b"")
        raise AssertionError("Cloud state was modified before billing preflight")
    with patch.object(deploy.shutil, "which", return_value="/mock/gcloud"), patch.object(deploy, "command", side_effect=disabled_billing):
        try: deploy.apply(args); raise AssertionError("Unbilled project was deployed")
        except RuntimeError as error: assert "billing" in str(error)
    assert len(cloud_calls) == 2

    cloud_calls.clear()
    secret_input_checked = []
    def simulated_cloud(*cmd, **kwargs):
        assert fake_key not in repr(cmd), "Secret must never enter command-line arguments"
        cloud_calls.append(cmd)
        if cmd[:2] == ("auth", "list"): data = b"teacher@example.edu\n"
        elif cmd[:3] == ("billing", "projects", "describe"): data = b'{"billingEnabled":true}'
        elif cmd[:3] == ("secrets", "versions", "add"):
            assert kwargs["input_bytes"] == fake_key.encode()
            secret_input_checked.append(True)
            data = b"projects/test/secrets/learning-wall-openai-key/versions/2\n"
        elif cmd[:3] == ("run", "services", "describe"): data = b"https://test-service-123.a.run.app\n"
        else: data = b""
        return subprocess.CompletedProcess(cmd, 0, data, b"")
    output = io.StringIO()
    with patch.object(deploy.shutil, "which", return_value="/mock/gcloud"), patch.object(deploy, "command", side_effect=simulated_cloud), patch.object(deploy, "verify_http") as health:
        with redirect_stdout(output): deploy.apply(args)
        health.assert_called_once_with("https://test-service-123.a.run.app")
    assert fake_key not in output.getvalue()
    assert secret_input_checked == [True]
    assert any("--role=roles/secretmanager.secretAccessor" in call and call[:2] == ("secrets", "add-iam-policy-binding") for call in cloud_calls)
    assert not any("--role=roles/secretmanager.secretAccessor" in call and call[:2] == ("projects", "add-iam-policy-binding") for call in cloud_calls)

    # Real gitignore matching verifies that both upload filters exclude credential fixtures.
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    forbidden = [".env", "server/.env.local", "server/recipient-private-key.jwk.json",
                 "server/firebase-service-account.json", "private/api-key.txt", "node_modules/secret.js"]
    allowed = ["Dockerfile", "package.json", "package-lock.json", "firebase-applet-config.json",
               "server/wallOpenAi.ts", "server/wallApiApp.ts", "server/wallApiServer.ts"]
    for name in forbidden + allowed:
        file = root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.touch()
    for ignore_file in [".dockerignore", ".gcloudignore"]:
        (root / ".gitignore").write_text((ROOT / ignore_file).read_text())
        for name in forbidden:
            assert subprocess.run(["git", "check-ignore", "-q", "--no-index", name], cwd=root).returncode == 0, name
        for name in allowed:
            assert subprocess.run(["git", "check-ignore", "-q", "--no-index", name], cwd=root).returncode == 1, name

print("Deployment passed: preview without credentials, billing preflight before mutations, stdin-only secret transfer, secret-scoped access and credential-free upload allowlists.")
