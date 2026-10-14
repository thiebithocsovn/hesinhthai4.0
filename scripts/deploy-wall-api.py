#!/usr/bin/env python3
"""Deploy only the private wall API. Secrets are passed to gcloud through stdin."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PROJECT = json.loads((ROOT / "firebase-applet-config.json").read_text())["projectId"]
SERVICE = "learning-wall-ai"
REGION = "asia-southeast1"
SECRET = "learning-wall-openai-key"
RUNTIME_ACCOUNT = "wall-ai-runtime@" + PROJECT + ".iam.gserviceaccount.com"
BUILD_ACCOUNT = "wall-ai-builder@" + PROJECT + ".iam.gserviceaccount.com"
ORIGIN = "https://thiebithocsovn.github.io"


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--teacher-email", action="append", default=[])
    parser.add_argument("--teacher-uid", action="append", default=[])
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--apply", action="store_true", help="Apply the displayed deployment plan.")
    args = parser.parse_args(argv)
    args.teacher_email = sorted(set(value.strip().lower() for value in args.teacher_email))
    args.teacher_uid = sorted(set(value.strip() for value in args.teacher_uid))
    if not args.teacher_email and not args.teacher_uid:
        parser.error("Specify at least one authorized teacher email or Firebase UID.")
    if any(not re.fullmatch(r"[^\s,=<>]+@[^\s,=<>]+\.[^\s,=<>]+", value) for value in args.teacher_email):
        parser.error("Teacher email is invalid.")
    if any(not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value) for value in args.teacher_uid):
        parser.error("Teacher UID is invalid.")
    return args


def plan(args):
    return {
        "project": PROJECT, "service": SERVICE, "region": REGION,
        "runtime": "Node.js 22", "minInstances": 0, "maxInstances": 1,
        "cpu": 1, "memory": "512Mi", "concurrency": 3, "timeoutSeconds": 60,
        "secret": SECRET, "runtimeAccount": RUNTIME_ACCOUNT,
        "runtimeRoles": ["roles/firebaseauth.viewer", "roles/secretmanager.secretAccessor (this secret only)"],
        "buildAccount": BUILD_ACCOUNT, "buildRole": "roles/run.builder",
        "allowedOrigin": ORIGIN, "teacherEmails": args.teacher_email, "teacherUids": args.teacher_uid,
        "model": "gpt-5.4-mini", "publicHttps": True,
        "authentication": "Firebase ID token with revocation checks; explicit teacher allowlist",
        "billing": "Existing enabled Google Cloud billing required; this script does not activate billing or buy API credit.",
        "secretHandling": "Secret Manager version, stdin only; never code, container image, command-line argument or logs.",
    }


def command(*args, input_bytes=None, optional=False):
    result = subprocess.run(["gcloud", *args, "--quiet"], cwd=ROOT, input=input_bytes,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode and not optional:
        detail = re.sub(rb"sk-[A-Za-z0-9_-]+", b"[REDACTED]", result.stderr).decode(errors="replace")
        raise RuntimeError("Google Cloud command failed: " + detail[-1800:])
    return result


def read_key(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_nlink != 1:
        raise RuntimeError("The confirmed env file must be a regular, non-linked file.")
    key = ""
    for line in path.read_text().splitlines():
        match = re.match(r"^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(.*?)\s*$", line)
        if match:
            key = match.group(1).strip().strip("\"'")
    if not re.fullmatch(r"sk-[A-Za-z0-9_-]+", key):
        raise RuntimeError("No valid OpenAI credential is configured in the confirmed env file.")
    return key.encode()


def ensure_account(name, email):
    if command("iam", "service-accounts", "describe", email, "--project=" + PROJECT,
               "--format=none", optional=True).returncode:
        command("iam", "service-accounts", "create", name, "--project=" + PROJECT, "--format=none")


def verify_http(url):
    if not url.startswith("https://") or not re.fullmatch(r"https://[A-Za-z0-9.-]+\.run\.app/?", url):
        raise RuntimeError("Google Cloud returned an unexpected service URL.")
    with urllib.request.urlopen(url.rstrip("/") + "/healthz", timeout=30) as response:
        status = json.loads(response.read())
        if status.get("status") != "ok" or not status.get("configured"):
            raise RuntimeError("The server is up but its private AI configuration is incomplete.")
    request = urllib.request.Request(url.rstrip("/") + "/api/wall-ai/connection", data=b"{}",
                                     headers={"Content-Type": "application/json", "Origin": ORIGIN})
    try:
        urllib.request.urlopen(request, timeout=30).read()
        raise RuntimeError("The server accepted an unauthenticated AI request.")
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise RuntimeError("The authentication guard did not return the expected HTTP 401.") from error


def apply(args):
    if not shutil.which("gcloud"):
        raise RuntimeError("Google Cloud CLI is not installed.")
    active = command("auth", "list", "--filter=status:ACTIVE", "--format=value(account)").stdout.strip()
    if not active:
        raise RuntimeError("Google Cloud has no signed-in deployment account.")
    billing = json.loads(command("billing", "projects", "describe", PROJECT, "--format=json").stdout)
    if not billing.get("billingEnabled"):
        raise RuntimeError("This project has no enabled Google Cloud billing. No resources were created.")
    key = read_key(args.env_file)
    command("services", "enable", "run.googleapis.com", "cloudbuild.googleapis.com",
            "artifactregistry.googleapis.com", "secretmanager.googleapis.com", "iam.googleapis.com",
            "identitytoolkit.googleapis.com", "--project=" + PROJECT, "--format=none")
    ensure_account("wall-ai-runtime", RUNTIME_ACCOUNT)
    ensure_account("wall-ai-builder", BUILD_ACCOUNT)
    for account, role in [(RUNTIME_ACCOUNT, "roles/firebaseauth.viewer"), (BUILD_ACCOUNT, "roles/run.builder")]:
        command("projects", "add-iam-policy-binding", PROJECT, "--member=serviceAccount:" + account,
                "--role=" + role, "--condition=None", "--format=none")
    if command("secrets", "describe", SECRET, "--project=" + PROJECT, "--format=none", optional=True).returncode:
        command("secrets", "create", SECRET, "--project=" + PROJECT,
                "--replication-policy=automatic", "--format=none")
    version_result = command("secrets", "versions", "add", SECRET, "--project=" + PROJECT,
                             "--data-file=-", "--format=value(name)", input_bytes=key)
    del key
    version = version_result.stdout.decode().strip().split("/")[-1]
    if not version.isdigit():
        raise RuntimeError("Secret Manager did not return a valid secret version.")
    command("secrets", "add-iam-policy-binding", SECRET, "--project=" + PROJECT,
            "--member=serviceAccount:" + RUNTIME_ACCOUNT, "--role=roles/secretmanager.secretAccessor",
            "--format=none")
    env = "^|^OPENAI_MODEL=gpt-5.4-mini|ALLOWED_ORIGINS=" + ORIGIN
    env += "|OPENAI_TEACHER_UIDS=" + ",".join(args.teacher_uid)
    env += "|OPENAI_TEACHER_EMAILS=" + ",".join(args.teacher_email)
    command("run", "deploy", SERVICE, "--project=" + PROJECT, "--region=" + REGION, "--source=.",
            "--build-service-account=projects/" + PROJECT + "/serviceAccounts/" + BUILD_ACCOUNT,
            "--service-account=" + RUNTIME_ACCOUNT, "--update-secrets=OPENAI_API_KEY=" + SECRET + ":" + version,
            "--update-env-vars=" + env, "--min=0", "--max=1", "--concurrency=3", "--timeout=60",
            "--cpu=1", "--memory=512Mi", "--port=8080", "--allow-unauthenticated", "--format=none")
    url = command("run", "services", "describe", SERVICE, "--project=" + PROJECT,
                  "--region=" + REGION, "--format=value(status.url)").stdout.decode().strip()
    verify_http(url)
    print(json.dumps({"deployed": True, "url": url, "anonymousRequestDenied": True,
                      "frontendVariable": "VITE_WALL_OPENAI_API_URL", "frontendValue": url,
                      "realAiConnectionStillNeedsVerification": True}, ensure_ascii=False))


def main(argv=None):
    args = arguments(argv)
    print(json.dumps({"deploymentPlan": plan(args), "applyRequested": args.apply}, ensure_ascii=False))
    if args.apply:
        apply(args)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
