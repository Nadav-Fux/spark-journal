#!/usr/bin/env python3
"""
deploy_and_email.py — One-shot Spark Log deploy + email notification

Usage:
    python3 /tmp/spark-journal/deploy_and_email.py

What it does:
1. Git commit + push the latest entries.json
2. Deploy to CF Pages via wrangler
3. Purge CF cache
4. Read the LAST entry from entries.json
5. Build a styled HTML email from that entry's summary + key fields
6. Send it to nadavf@gmail.com via AgentMail

No arguments needed — it auto-detects the latest entry.
"""

import json
import os
import subprocess
import sys
import urllib.request
import html

# ─── Config ───────────────────────────────────────────────────────────
LOG_DIR = "/tmp/spark-journal"
ENTRIES_FILE = os.path.join(LOG_DIR, "data/entries.json")
CF_API_TOKEN = "K-X1XspNUmZdTOpO2_tBGcxRSc0AhHS756_O4xKE"
CF_ACCOUNT_ID = "5bf57396a7de9b1331d2ed6093af01c9"
CF_ZONE_ID = "84e65349589e0064fd8bb79a0c3de143"
AGENTMAIL_KEY = "am_36ae8205ef7143dccc4995c31dcf4890d38d1ceccc0ac11ad320919d2db69977"
AGENTMAIL_INBOX = "sparkemail@agentmail.to"
EMAIL_TO = "nadavf@gmail.com"

# Category colors (matching the Spark Log site)
CATEGORY_COLORS = {
    "system": "#06b6d4",
    "monitoring": "#8b5cf6",
    "security": "#ef4444",
    "deployment": "#22c55e",
    "performance": "#f59e0b",
    "features": "#a855f7",
    "research": "#06b6d4",
    "future-plans": "#8b5cf6",
    "projects": "#22c55e",
    "posts": "#3b82f6",
    "ideas": "#fbbf24",
}

SEVERITY_LABELS = {
    "critical": ("CRITICAL", "#ef4444"),
    "warning": ("WARNING", "#f59e0b"),
    "info": ("INFO", "#06b6d4"),
    "success": ("SUCCESS", "#22c55e"),
}


def run(cmd, cwd=LOG_DIR):
    """Run a shell command and return (returncode, stdout)."""
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def deploy():
    """Git push + wrangler deploy + cache purge."""
    print("=== Step 1: Git commit + push ===")
    run("git add data/entries.json")

    # Get the latest entry title for the commit message
    with open(ENTRIES_FILE, "r") as f:
        data = json.load(f)
    last_entry = data["entries"][-1]
    title = last_entry.get("title_en", "New entry")

    rc, out, err = run(f'git commit -m "Add log entry: {title}"')
    if rc != 0 and "nothing to commit" in err:
        print("  Nothing to commit (already committed)")
    else:
        print(f"  Committed: {out.split(chr(10))[0] if out else err.split(chr(10))[0]}")

    rc, out, err = run("git push origin main")
    if rc != 0 and "Everything up-to-date" not in err:
        print(f"  Push failed: {err}")
        # Try pull + push
        run("git pull --rebase origin main")
        run("git push origin main")
    print("  Pushed to GitHub")

    print("=== Step 2: Wrangler deploy ===")
    env = {
        **os.environ,
        "CLOUDFLARE_API_TOKEN": CF_API_TOKEN,
        "CLOUDFLARE_ACCOUNT_ID": CF_ACCOUNT_ID,
    }
    rc, out, err = run(
        "rm -rf .wrangler && npx wrangler@latest pages deploy . "
        "--project-name=spark-journal --branch=main --commit-dirty=true",
    )
    # wrangler output goes to stderr sometimes
    deploy_url = ""
    for line in (out + "\n" + err).split("\n"):
        if "https://" in line and "pages.dev" in line:
            deploy_url = line.strip()
            break
    print(f"  Deployed: {deploy_url or 'OK'}")

    print("=== Step 3: Purge CF cache ===")
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/zones/{CF_ZONE_ID}/purge_cache",
        data=json.dumps({"purge_everything": True}).encode(),
        headers={
            "Authorization": f"Bearer {CF_API_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        r = json.loads(resp.read())
        print(f"  Cache purged: {r.get('success', False)}")

    return last_entry


def build_email_html(entry):
    """Build a styled email from a log entry."""
    cat = entry.get("category", "system")
    sev = entry.get("severity", "info")
    cat_color = CATEGORY_COLORS.get(cat, "#06b6d4")
    sev_label, sev_color = SEVERITY_LABELS.get(sev, ("INFO", "#06b6d4"))

    title = html.escape(entry.get("title_en", "New Log Entry"))
    summary = html.escape(entry.get("summary_en", ""))
    date = entry.get("date", "")[:10]
    tags = entry.get("tags", [])
    entry_id = entry.get("id", "")

    tags_html = " ".join(
        f"<span style='display:inline-block;background:#1e293b;color:#94a3b8;padding:2px 8px;"
        f"border-radius:10px;font-size:11px;margin:2px;'>{html.escape(t)}</span>"
        for t in tags[:8]
    )

    log_url = f"https://journal.nvision.me/#entry/{entry_id}" if entry_id else "https://journal.nvision.me"

    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:'Segoe UI',Arial,sans-serif;color:#e2e8f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a14;">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

<tr><td style="background:linear-gradient(135deg,#0f172a,#1e293b);border:1px solid #1e3a4a;border-radius:12px 12px 0 0;padding:30px 36px;text-align:center;">
<div style="font-size:11px;color:{cat_color};letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">NEW LOG ENTRY</div>
<h1 style="margin:0 0 12px;font-size:22px;color:#f1f5f9;line-height:1.3;">{title}</h1>
<div style="margin-bottom:12px;">
<span style="display:inline-block;background:rgba(6,182,212,0.1);border:1px solid {cat_color};color:{cat_color};border-radius:14px;padding:3px 14px;font-size:12px;font-weight:600;margin-right:6px;">{html.escape(cat)}</span>
<span style="display:inline-block;background:rgba(0,0,0,0.3);border:1px solid {sev_color};color:{sev_color};border-radius:14px;padding:3px 14px;font-size:12px;font-weight:600;">{sev_label}</span>
</div>
<div style="font-size:13px;color:#64748b;">{date}</div>
</td></tr>

<tr><td style="background:#0f172a;border-left:1px solid #1e3a4a;border-right:1px solid #1e3a4a;padding:28px 36px;">
<p style="margin:0 0 16px;font-size:15px;color:#cbd5e1;line-height:1.6;">{summary}</p>
<div style="margin-top:12px;">{tags_html}</div>
</td></tr>

<tr><td style="background:linear-gradient(135deg,#0f172a,#1e293b);border:1px solid #1e3a4a;border-radius:0 0 12px 12px;padding:24px 36px;text-align:center;">
<a href="{log_url}" style="display:inline-block;background:#06b6d4;color:#0a0a14;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">Read Full Report</a>
<p style="margin:16px 0 0;font-size:12px;color:#334155;">Spark Log — journal.nvision.me</p>
</td></tr>

</table></td></tr></table></body></html>"""


def send_email(entry):
    """Send email notification for the latest entry via AgentMail SDK."""
    print("=== Step 4: Send email ===")

    title = entry.get("title_en", "New Log Entry")
    cat = entry.get("category", "system").upper()

    email_html = build_email_html(entry)
    subject = f"[{cat}] {title}"

    # Plain-text fallback
    summary = entry.get("summary_en", "")
    text_content = f"{subject}\n\n{summary}\n\nRead full report: https://journal.nvision.me (Spark Log)"

    try:
        from agentmail import AgentMail

        client = AgentMail(api_key=AGENTMAIL_KEY)
        response = client.inboxes.messages.send(
            inbox_id=AGENTMAIL_INBOX,
            to=[EMAIL_TO],
            subject=subject,
            text=text_content,
            html=email_html,
        )
        print(f"  Email sent! Message ID: {response.message_id}")
        return True
    except Exception as e:
        print(f"  Email error: {e}")
        return False


def main():
    if not os.path.exists(ENTRIES_FILE):
        print(f"ERROR: {ENTRIES_FILE} not found")
        sys.exit(1)

    entry = deploy()
    send_email(entry)

    print("\n=== Done! ===")
    print(f"  Entry: {entry.get('id', '?')}")
    print(f"  Spark Log: https://journal.nvision.me")
    print(f"  Email: {EMAIL_TO}")


if __name__ == "__main__":
    main()
