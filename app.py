import json
import os
import re
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from openai import OpenAI

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
CORS(app)

# ── Affiliate Scheduler ──────────────────────────────────────────
def _trigger_affiliate_job():
    import urllib.request as _req
    import json as _json
    token = os.environ.get("GITHUB_TOKEN", "")
    repo  = os.environ.get("GITHUB_REPO", "sportiviforyou-netizen/jarvis-affiliate")
    wf_id = os.environ.get("AFFILIATE_WF_ID", "273219086")
    if not token:
        print("[Scheduler] GITHUB_TOKEN missing — skipping")
        return
    try:
        url  = f"https://api.github.com/repos/{repo}/actions/workflows/{wf_id}/dispatches"
        body = _json.dumps({"ref": "master"}).encode()
        req  = _req.Request(url, data=body, method="POST", headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        })
        with _req.urlopen(req, timeout=10) as r:
            print(f"[Scheduler] Affiliate triggered — HTTP {r.status}")
    except Exception as e:
        print(f"[Scheduler] Error: {e}")

def _start_scheduler():
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger
        # Use Asia/Jerusalem so DST is handled automatically.
        # APScheduler ≥ 3.9 accepts IANA timezone strings directly.
        TZ = "Asia/Jerusalem"
        sched = BackgroundScheduler(timezone=TZ)
        # 15 daily runs in Israel Standard Time (09:00 – 21:08)
        times = [
            (9, 0),(9,52),(10,44),(11,36),(12,28),
            (13,20),(14,12),(15, 4),(15,56),(16,48),
            (17,40),(18,32),(19,24),(20,16),(21, 8),
        ]
        for h, m in times:
            sched.add_job(
                _trigger_affiliate_job,
                CronTrigger(hour=h, minute=m, timezone=TZ),
                id=f"affiliate_{h}_{m}",
                replace_existing=True,
            )
        sched.start()
        print(f"[Scheduler] Started — {len(times)} daily jobs · timezone={TZ}")
    except Exception as e:
        print(f"[Scheduler] Failed to start: {e}")

client = OpenAI() if os.environ.get("OPENAI_API_KEY") else None

BRAIN_VERSION = "2.3"
ACTIVE_BRAIN = "OpenAI"
ACTION_TYPES = {
    "direct_answer",
    "open_url",
    "write_text",
    "code_task",
    "web_search_needed",
    "approval_required",
    "unsupported_tool",
}
MEMORY_DIR = os.path.join(BASE_DIR, "memory")
MEMORY_FILES = [
    "profile.md",
    "preferences.md",
    "project_state.md",
    "decisions.md",
    "tasks.md",
]
MAX_MEMORY_CHARS = 8000

# ── Vault-backed memory persistence (GAP-08 fix) ─────────────────────────────
# On Render restart, _sync_memory_from_vault() pulls memory files from
# jarvis-vault/memory/ to local MEMORY_DIR so all reads stay fast.
# Every write goes to BOTH local filesystem AND vault.
VAULT_MEMORY_REPO  = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")
VAULT_MEMORY_TOKEN = os.environ.get("GITHUB_TOKEN", "")


def _vault_gh_get(path: str) -> dict:
    # GET a file from jarvis-vault. Returns {} on 404 or error.
    if not VAULT_MEMORY_TOKEN:
        return {}
    import urllib.request as _vr
    import urllib.error as _ve
    url = f"https://api.github.com/repos/{VAULT_MEMORY_REPO}/contents/{path}"
    try:
        req = _vr.Request(url, headers={
            "Authorization": f"Bearer {VAULT_MEMORY_TOKEN}",
            "Accept":        "application/vnd.github+json",
        })
        with _vr.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except _ve.HTTPError as e:
        if e.code != 404:
            print(f"[Memory-Vault] GET {e.code}: {path}")
        return {}
    except Exception as e:
        print(f"[Memory-Vault] GET error: {e}")
        return {}


def _vault_gh_put(path: str, content: str, message: str, sha: str = "") -> bool:
    # PUT (create or update) a file in jarvis-vault.
    if not VAULT_MEMORY_TOKEN:
        return False
    import urllib.request as _vr
    import base64 as _b64
    body = {
        "message": message,
        "content": _b64.b64encode(content.encode("utf-8")).decode(),
    }
    if sha:
        body["sha"] = sha
    url = f"https://api.github.com/repos/{VAULT_MEMORY_REPO}/contents/{path}"
    try:
        req = _vr.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            method="PUT",
            headers={
                "Authorization": f"Bearer {VAULT_MEMORY_TOKEN}",
                "Accept":        "application/vnd.github+json",
                "Content-Type":  "application/json",
            },
        )
        with _vr.urlopen(req, timeout=15) as r:
            return r.status in (200, 201)
    except Exception as e:
        print(f"[Memory-Vault] PUT error: {e}")
        return False


def _vault_read_memory_file(filename: str) -> str:
    # Read a memory file from jarvis-vault/memory/. Returns empty string on miss.
    if filename not in MEMORY_FILES:
        return ""
    data = _vault_gh_get(f"memory/{filename}")
    if not data:
        return ""
    try:
        import base64 as _b64
        return _b64.b64decode(data["content"].replace("\n", "")).decode("utf-8")
    except Exception as e:
        print(f"[Memory-Vault] decode error {filename}: {e}")
        return ""


def _vault_write_memory_file(filename: str, content: str) -> bool:
    # Write a memory file to jarvis-vault/memory/.
    if filename not in MEMORY_FILES:
        return False
    path     = f"memory/{filename}"
    existing = _vault_gh_get(path)
    sha      = existing.get("sha", "")
    return _vault_gh_put(path, content, f"[GARVIS] memory/{filename}", sha=sha)


def _sync_memory_from_vault():
    # Pull all memory files from jarvis-vault to local MEMORY_DIR.
    # Called once at Render startup so memory persists across redeploys/restarts.
    if not VAULT_MEMORY_TOKEN:
        print("[Memory-Vault] No GITHUB_TOKEN -- local memory only (not persistent)")
        return
    os.makedirs(MEMORY_DIR, exist_ok=True)
    synced = 0
    for filename in MEMORY_FILES:
        content = _vault_read_memory_file(filename)
        if content:
            local_path = os.path.join(MEMORY_DIR, filename)
            try:
                with open(local_path, "w", encoding="utf-8") as f:
                    f.write(content)
                synced += 1
            except OSError as e:
                print(f"[Memory-Vault] Write local {filename}: {e}")
    print(f"[Memory-Vault] Synced {synced}/{len(MEMORY_FILES)} memory files from vault")

# Start only once (not in Flask reloader child process)
if not os.environ.get("WERKZEUG_RUN_MAIN"):
    _start_scheduler()
    _sync_memory_from_vault()  # Pull persistent memory from vault on startup (GAP-08 fix)
# ────────────────────────────────────────────────────────────────

SECRET_MARKERS = [
    "private key",
    "bearer token",
    "כרטיס אשראי",
    "פרטי אשראי",
    "חשבון בנק",
    "סיסמה",
    "טוקן",
    "מפתח api",
    "מפתח API",
]
SECRET_PATTERNS = [
    r"\b(?:openai|anthropic)?_?api_?key\s*[:=]",
    r"\bapi[_-]?key\s*[:=]",
    r"\btoken\s*[:=]",
    r"\bpassword\s*[:=]",
    r"\bpasswd\s*[:=]",
    r"\bbearer\s+[a-z0-9._\-]{12,}",
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    r"\b(?:sk|pk)-[a-zA-Z0-9_\-]{16,}",
    r"\b(?:\d[ -]*?){13,19}\b",
    r"\b(?:bank|iban|account)\s*(?:number|details)?\s*[:=]",
    r"\.env",
]


def detect_action_url(command: str):
    text = command.lower()

    if "ynet" in text or "ווינט" in text or "ידיעות" in text:
        return "https://www.ynet.co.il"

    if "google" in text or "גוגל" in text:
        return "https://www.google.com"

    if "youtube" in text or "יוטיוב" in text:
        return "https://www.youtube.com"

    if "github" in text or "גיטהאב" in text:
        return "https://github.com"

    if "render" in text or "רנדר" in text:
        return "https://dashboard.render.com"

    if "chatgpt" in text or "צאט" in text or "צ׳אט" in text:
        return "https://chatgpt.com"

    if "claude" in text or "קלוד" in text:
        return "https://claude.ai"

    if "grok" in text or "גרוק" in text:
        return "https://grok.com"

    if "canva" in text or "קנבה" in text:
        return "https://www.canva.com"

    return None


def has_any(text: str, keywords):
    return any(keyword in text for keyword in keywords)


def looks_like_secret(text: str):
    lowered = text.lower()
    if has_any(lowered, [marker.lower() for marker in SECRET_MARKERS]):
        return True

    return any(re.search(pattern, text, re.IGNORECASE) for pattern in SECRET_PATTERNS)


def load_memory_context():
    # Ensure dir exists after Render restart
    os.makedirs(MEMORY_DIR, exist_ok=True)

    sections = []
    total_chars = 0

    for filename in MEMORY_FILES:
        path    = os.path.join(MEMORY_DIR, filename)
        content = ""

        # Try local file first (fast)
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as file:
                    content = file.read().strip()
            except OSError:
                content = ""

        # Vault fallback if local file missing or empty (GAP-08 fix)
        if not content:
            vault_content = _vault_read_memory_file(filename)
            if vault_content:
                content = vault_content.strip()
                try:
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(vault_content)
                except OSError:
                    pass

        if not content:
            continue

        if not content:
            continue

        if looks_like_secret(content):
            content = "[Memory file ignored because it appears to contain secrets.]"

        section = f"## {filename}\n{content}"
        remaining = MAX_MEMORY_CHARS - total_chars
        if remaining <= 0:
            break

        if len(section) > remaining:
            section = section[:remaining]

        sections.append(section)
        total_chars += len(section)

    return "\n\n".join(sections)


def is_memory_save_command(command: str) -> bool:
    text = (command or "").strip()
    triggers = [
        "שמור לזיכרון:",
        "תזכור ש",
        "עדכן בזיכרון ש",
        "שמור בזיכרון",
    ]
    return any(text.startswith(trigger) for trigger in triggers)


def extract_memory_text(command: str) -> str:
    text = (command or "").strip()
    triggers = [
        "שמור לזיכרון:",
        "תזכור ש",
        "עדכן בזיכרון ש",
        "שמור בזיכרון",
    ]

    for trigger in triggers:
        if text.startswith(trigger):
            return text[len(trigger):].strip(" :\n\t")

    return ""


def choose_memory_file(memory_text: str) -> str:
    text = (memory_text or "").lower()

    if has_any(text, ["מעדיף", "תענה", "סגנון", "עברית", "קצר", "ארוך", "ישיר", "preference", "prefers", "style"]):
        return "preferences.md"

    if has_any(text, ["שם", "משפחה", "מיקום", "גר ב", "עסק", "profile", "location", "business"]):
        return "profile.md"

    if has_any(text, ["הפרויקט", "מצב", "render", "flask", "frontend", "backend", "deployment", "project"]):
        return "project_state.md"

    if has_any(text, ["החלטנו", "החלטה", "בחירה", "אסור", "חייב", "decision", "decided"]):
        return "decisions.md"

    if has_any(text, ["צריך", "משימה", "לעשות", "תזכורת", "בהמשך", "todo", "task", "next"]):
        return "tasks.md"

    return "tasks.md"


def append_memory_item(filename: str, memory_text: str) -> None:
    if filename not in MEMORY_FILES:
        raise ValueError("Memory filename is not allowed.")

    os.makedirs(MEMORY_DIR, exist_ok=True)
    path = os.path.join(MEMORY_DIR, filename)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    new_line = f"\n- {timestamp}: {memory_text}\n"

    # 1. Write to local filesystem (fast reads within session)
    with open(path, "a", encoding="utf-8") as file:
        file.write(new_line)

    # 2. Write to vault for persistence across Render restarts (GAP-08 fix)
    try:
        existing_content = _vault_read_memory_file(filename) or ""
        updated_content  = existing_content + new_line
        ok = _vault_write_memory_file(filename, updated_content)
        if ok:
            print(f"[Memory-Vault] Saved {filename} to vault")
        else:
            print(f"[Memory-Vault] Vault write failed for {filename} (local write OK)")
    except Exception as e:
        print(f"[Memory-Vault] Vault write error {filename}: {e}")


def is_memory_show_command(command: str) -> bool:
    text = (command or "").strip()
    triggers = [
        "מה אתה זוכר עליי",
        "מה אתה זוכר על הפרויקט",
        "הצג לי את הזיכרון שלך",
    ]
    return any(trigger in text for trigger in triggers)


def select_memory_files_for_show(command: str) -> list[str]:
    text = (command or "").strip()

    if "עליי" in text:
        return ["profile.md", "preferences.md"]

    if "על הפרויקט" in text:
        return ["project_state.md", "decisions.md", "tasks.md"]

    return list(MEMORY_FILES)


def read_memory_files(filenames: list[str]) -> str:
    sections = []

    for filename in filenames:
        if filename not in MEMORY_FILES:
            continue

        path    = os.path.join(MEMORY_DIR, filename)
        content = ""

        # Try local file first (fast)
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as file:
                    content = file.read().strip()
            except OSError:
                content = ""

        # Vault fallback if local file missing or empty (GAP-08 fix)
        if not content:
            vault_content = _vault_read_memory_file(filename)
            if vault_content:
                content = vault_content.strip()
                os.makedirs(MEMORY_DIR, exist_ok=True)
                try:
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(vault_content)
                except OSError:
                    pass

        if not content:
            content = "\u05d0\u05d9\u05df \u05de\u05d9\u05d3\u05e2 \u05e9\u05de\u05d5\u05e8."
        elif looks_like_secret(content):
            content = "[\u05d4\u05e7\u05d5\u05d1\u05e5 \u05dc\u05d0 \u05de\u05d5\u05e6\u05d2 \u05db\u05d9 \u05d4\u05d5\u05d0 \u05e0\u05e8\u05d0\u05d4 \u05db\u05d0\u05d9\u05dc\u05d5 \u05d4\u05d5\u05d0 \u05de\u05db\u05d9\u05dc \u05de\u05d9\u05d3\u05e2 \u05e8\u05d2\u05d9\u05e9 \u05d0\u05d5 \u05e1\u05d5\u05d3\u05d9.]"

        sections.append(f"memory/{filename}\n{content}")

    return "\n\n".join(sections)
def build_memory_show_response(command: str) -> str:
    filenames = select_memory_files_for_show(command)
    memory_text = read_memory_files(filenames)

    return f"זה מה ששמור בזיכרון:\n\n{memory_text}"


def is_memory_delete_command(command: str) -> bool:
    text = (command or "").strip()
    triggers = [
        "מחק מהזיכרון ש",
        "תמחק מהזיכרון ש",
        "הסר מהזיכרון ש",
    ]
    return any(text.startswith(trigger) for trigger in triggers)


def extract_memory_delete_text(command: str) -> str:
    text = (command or "").strip()
    triggers = [
        "מחק מהזיכרון ש",
        "תמחק מהזיכרון ש",
        "הסר מהזיכרון ש",
    ]

    for trigger in triggers:
        if text.startswith(trigger):
            return text[len(trigger):].strip(" :\n\t")

    return ""


def find_memory_delete_candidates(search_text: str) -> list[tuple[str, str]]:
    query = (search_text or "").strip().lower()
    if not query:
        return []

    candidates = []

    for filename in MEMORY_FILES:
        path = os.path.join(MEMORY_DIR, filename)
        if not os.path.isfile(path):
            continue

        try:
            with open(path, "r", encoding="utf-8") as file:
                lines = file.readlines()
        except OSError:
            continue

        for line in lines:
            clean_line = line.strip()
            if clean_line and query in clean_line.lower():
                candidates.append((filename, clean_line))

    return candidates


def build_memory_delete_response(search_text: str) -> str:
    if not search_text:
        return (
            "לא נמצא תוכן לחיפוש בזיכרון.\n\n"
            "לא מחקתי כלום.\n"
            "כדי למחוק בפועל צריך שלב אישור מפורש."
        )

    candidates = find_memory_delete_candidates(search_text)

    if not candidates:
        return (
            f"לא מצאתי פריטים תואמים למחיקה עבור: {search_text}\n\n"
            "לא מחקתי כלום.\n"
            "כדי למחוק בפועל צריך שלב אישור מפורש."
        )

    lines = ["מצאתי פריטים אפשריים למחיקה:"]
    for index, (filename, line) in enumerate(candidates, start=1):
        lines.append(f"\n{index}. memory/{filename}\n{line}")

    lines.append("\nלא מחקתי כלום.")
    lines.append("כדי למחוק בפועל צריך שלב אישור מפורש.")
    return "\n".join(lines)


def approval_requested(text: str):
    return has_any(text, [
        "אישור לפני",
        "תאשר איתי לפני",
        "תבקש אישור",
        "אל תבצע בלי אישור",
        "לא לבצע בלי אישור",
        "confirm before",
        "ask approval",
    ])


def route_command(command: str):
    text = (command or "").lower()

    if not text.strip():
        return "direct_answer"

    sensitive_words = [
        "מחק", "למחוק", "מחיקה", "delete",
        "שלח", "לשלוח", "שליחה", "send",
        "פרסם", "לפרסם", "publish",
        "קנה", "לקנות", "רכישה", "buy", "purchase",
        "deploy", "דיפלוי", "פריסה", "מערכת פעילה", "מערכת חיה", "production",
        "מידע פרטי", "פרטים פרטיים", "סיסמה", "password", "token", "api key", "מפתח api",
    ]
    if approval_requested(text) or has_any(text, sensitive_words):
        return "approval_required"

    if detect_action_url(command):
        return "open_url"

    live_words = [
        "חדשות", "עכשיו", "היום", "מחר", "כרגע", "עדכני", "עדכנית", "עדכניים",
        "מזג אוויר", "תחזית", "גשם", "טמפרטורה", "זריחה", "שקיעה",
        "מחיר", "מחירים", "שער דולר", "שער יורו", "בורסה", "מניה",
        "לוח זמנים", "זמנים", "זמינות", "זמין", "חוקים", "מדיניות", "כללים",
        "current", "latest", "live", "weather", "forecast", "price", "schedule",
        "availability", "rules", "policy",
    ]
    if has_any(text, live_words):
        return "web_search_needed"

    write_words = [
        "כתוב", "תכתוב", "נסח", "תנסח", "ניסוח", "הודעה", "מייל", "אימייל",
        "סיכום", "סכם", "פוסט", "מסמך", "מכתב", "תגובה", "wording", "write",
        "draft", "email", "summary", "post", "document",
    ]
    if has_any(text, write_words):
        return "write_text"

    code_words = [
        "קוד", "באג", "תקן", "פיתוח", "github", "render", "app.py", "app.js",
        "api", "שרת", "server", "frontend", "backend", "flask", "python",
        "javascript", "html", "css", "development",
    ]
    if has_any(text, code_words):
        return "code_task"

    unsupported_words = [
        "וואטסאפ", "whatsapp", "gmail", "calendar", "יומן", "דרייב", "drive",
        "טלגרם", "telegram", "sms",
    ]
    if has_any(text, unsupported_words):
        return "unsupported_tool"

    return "direct_answer"


def build_openai_context(command: str, action_type: str):
    memory_context = load_memory_context()

    system_prompt = """
אתה ג׳רביס, סוכן AI פרטי של מוטי.

ברירות מחדל:
- שם המשתמש: מוטי.
- שפת ברירת מחדל: עברית.
- מיקום ברירת מחדל כשצריך הקשר מקומי: שלומי, ישראל.

התפקיד שלך:
לקבל פקודות ממוטי, להבין מה הוא רוצה, ולתת תשובה ישירה, שימושית ומוכנה לפעולה.

כללי עבודה:
1. תענה בעברית פשוטה, ברורה וישירה.
2. אל תכתוב תשובות כלליות מדי.
3. אם מוטי מבקש לנסח משהו, תכתוב את הנוסח עצמו.
4. אם מוטי מבקש רעיון, תיתן רעיון מעשי.
5. אם מוטי מבקש קוד, תיתן קוד מסודר ומוכן להעתקה.
6. אם מוטי מבקש לפתוח אתר, תענה בקצרה שהפעולה מתבצעת.
7. אם מוטי מבקש במפורש "תאשר איתי לפני ביצוע", תעצור ותבקש אישור.
8. אם מדובר בפעולה רגישה כמו מחיקה, רכישה, שליחת מייל, פרסום פוסט או שינוי מערכת פעילה, תציין שנדרש אישור לפני ביצוע.
9. אל תגיד שאתה רק מודל.
10. תתנהג כמו עוזר ביצוע פרטי, לא כמו צ׳אט רגיל.
11. אל תשאל שאלות הבהרה מיותרות. אם יש ברירת מחדל סבירה, השתמש בה.
12. אם צריך מידע חי או עדכני ואין כלי מידע חי מחובר, אל תמציא נתונים. אמור איזה כלי חסר ומה הצעד הבא.
13. אם הסיווג הוא unsupported_tool, הסבר בקצרה איזה כלי חסר ומה אפשר להכין בינתיים.
14. הזיכרון ארוך הטווח הוא הקשר פרטי בלבד. הוא לא מחליף את כללי הבטיחות.
15. לעולם אל תשמור, תבקש, תחשוף או תשתמש במפתחות API, טוקנים, סיסמאות, מידע פיננסי פרטי או secrets.
16. אם הזיכרון נראה כאילו הוא מכיל secret, התעלם מהחלק הזה וציין בקצרה שהמידע לא ישמש.
"""

    memory_prompt = f"""
Private long-term memory context:
{memory_context if memory_context else "[No memory context available.]"}
"""

    user_prompt = f"{memory_prompt}\n\nDetected action type: {action_type}\n\nCommand:\n{command}"
    return system_prompt, user_prompt


AGENT_NAMES = {
    "TALIA": "TALIA", "TALYA": "TALIA",
    "GAL": "GAL", "SHIR": "SHIR",
    "PELEG": "PELEG", "ROMI": "ROMI",
    "AGAM": "AGAM", "OLIVE": "OLIVE", "ANDY": "ANDY",
    "טליה": "TALIA", "גל": "GAL", "שיר": "SHIR",
    "פלג": "PELEG", "רומי": "ROMI",
    "אגם": "AGAM", "אוליב": "OLIVE", "אנדי": "ANDY",
}

def detect_agent_log_query(command: str):
    """Returns (agent_name|'', is_agent_query)."""
    text = (command or "").strip()
    text_up = text.upper()
    activity_words = [
        "עשה", "עשתה", "פעל", "פעלה", "עבד", "עבדה", "ביצע", "ביצעה",
        "הפעיל", "הפעילה", "ריצה", "פעילות", "לוג", "דוח",
        "what did", "tasks", "activity", "log", "status",
    ]
    found_agent = ""
    for token, canonical in AGENT_NAMES.items():
        if token.upper() in text_up:
            found_agent = canonical
            break
    text_lower = text.lower()
    has_activity = any(w in text_lower for w in activity_words)
    if found_agent and has_activity:
        return found_agent, True
    return "", False


def should_use_web_search(command: str, action_type: str) -> bool:
    # Skip web search only for actions that never need live data
    skip_types = {"unsupported_tool", "approval_required", "open_url"}
    return action_type not in skip_types


def is_broad_news_query(command: str) -> bool:
    text = (command or "").lower()
    local_terms = ["שלומי", "ליד הבית שלי", "באזור שלי", "בצפון", "נהריה", "חיפה"]
    if has_any(text, local_terms):
        return False

    broad_news_terms = [
        "חדשות אחרונות",
        "החדשות האחרונות",
        "חדשות בישראל",
        "מה קורה בישראל",
        "latest news israel",
    ]
    return has_any(text, broad_news_terms)


def ask_openai_brain(command: str, action_type: str):
    model = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
    system_prompt, user_prompt = build_openai_context(command, action_type)

    response = client.responses.create(
        model=model,
        input=[
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": user_prompt
            }
        ]
    )

    return response.output_text


def ask_openai_with_web_search(command: str, action_type: str):
    model = os.environ.get(
        "OPENAI_SEARCH_MODEL",
        os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
    )
    system_prompt, user_prompt = build_openai_context(command, action_type)

    broad_news_guidance = ""
    if is_broad_news_query(command):
        broad_news_guidance = """
This is a broad national news query about Israel.
Use these search quality rules:
- Strongly prioritize these major sources first: כאן, Ynet, N12 / Channel 12, Haaretz, Israel Hayom, Globes, The Times of Israel, Jerusalem Post, Reuters, AP.
- Do not build a broad national news answer mostly from secondary, local, niche, or small sources.
- Use secondary, local, niche, or small sources only if the user asked for a local/niche topic, or if major sources are unavailable.
- If most available results are from secondary/local/small sources, say exactly: "תוצאות החיפוש הזמינות מוגבלות ולא כוללות מספיק מקורות מרכזיים."
- Group the answer by topic in 3 to 6 bullets max.
- Each bullet should include source names and links when available.
- Avoid long article-by-article summaries.
- Do not invent facts not supported by search results.
"""

    search_prompt = (
        f"{user_prompt}\n\n"
        "Use live web search for current facts. If search is unavailable, do not invent current information.\n"
        "Use search results carefully. Prefer reliable, relevant, recent sources over random or low-quality results.\n"
        f"{broad_news_guidance}"
    )

    for tool_type in ["web_search", "web_search_preview"]:
        try:
            response = client.responses.create(
                model=model,
                tools=[{"type": tool_type}],
                input=[
                    {
                        "role": "system",
                        "content": system_prompt
                    },
                    {
                        "role": "user",
                        "content": search_prompt
                    }
                ]
            )
            return response.output_text
        except Exception:
            continue

    return (
        "צריך כלי חיפוש חי כדי לענות על זה במדויק. "
        "כרגע כלי החיפוש לא זמין או לא נתמך בחשבון/API. "
        "לא אנחש תשובה עדכנית."
    )


def get_system_status():
    openai_key = os.environ.get("OPENAI_API_KEY")
    brain_status = "active" if openai_key else "missing_key"

    memory_files_status = {}
    for filename in MEMORY_FILES:
        path = os.path.join(MEMORY_DIR, filename)
        if os.path.isfile(path):
            try:
                size = os.path.getsize(path)
            except OSError:
                size = 0
            memory_files_status[filename] = {"exists": True, "size_bytes": size}
        else:
            memory_files_status[filename] = {"exists": False, "size_bytes": 0}

    tools_status = {
        "url_opener": "active",
        "memory_read": "active",
        "memory_write": "active",
        "memory_delete": "active",
        "web_search": "active" if openai_key else "depends_on_brain",
        "action_router": "active",
    }

    deployment_status = {
        "platform": "Render" if os.environ.get("RENDER") else "local",
        "port": int(os.environ.get("PORT", 10000)),
        "brain_version": BRAIN_VERSION,
        "active_brain": ACTIVE_BRAIN,
    }

    next_steps = []
    tasks_path = os.path.join(MEMORY_DIR, "tasks.md")
    if os.path.isfile(tasks_path):
        try:
            with open(tasks_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
            for line in lines:
                clean = line.strip()
                if clean and not clean.startswith("#") and not looks_like_secret(clean):
                    next_steps.append(clean)
        except OSError:
            pass

    return {
        "brain": {
            "status": brain_status,
            "version": BRAIN_VERSION,
            "model": os.environ.get("OPENAI_MODEL", "gpt-4.1-mini"),
            "active": ACTIVE_BRAIN,
        },
        "memory": {
            "files": memory_files_status,
            "total_files": len([f for f in memory_files_status.values() if f["exists"]]),
        },
        "tools": tools_status,
        "deployment": deployment_status,
        "next_steps": next_steps[-5:] if next_steps else ["אין משימות שמורות"],
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


@app.route("/system-status", methods=["GET"])
def system_status():
    return jsonify(get_system_status())


def get_sportivi_status():
    import urllib.request
    import json as _json

    github_token = os.environ.get("GITHUB_TOKEN", "")
    github_repo = os.environ.get("GITHUB_REPO", "sportiviforyou-netizen/jarvis-affiliate")

    agents = [
        {
            "id": 1,
            "name": "TALYA",
            "icon": "🔍",
            "role": "איתור מוצרים",
            "description": "מחפש מוצרי ספורט ב-AliExpress API — 3 קטגוריות אקראיות, ממוין לפי נמכר ביותר, מסנן לפי דירוג ≥ 3.5 ומחיר $3–$60. מקצר קישורים עם Bitly למעקב קליקים.",
            "status": "active",
        },
        {
            "id": 2,
            "name": "GAL",
            "icon": "🔬",
            "role": "דירוג עם AI",
            "description": "שולח כל מוצר ל-Claude AI לניתוח. מציון 0–100 — ציון 45 ומעלה עם המלצת publish עובר לשלב הבא",
            "status": "active",
        },
        {
            "id": 8,
            "name": "ANDY",
            "icon": "🛡️",
            "role": "אישור ואבטחה",
            "description": "שומר הסף של JARVIS — מונע פרסום כפול, מסנן מוצרים לא מתאימים, בודק מחיר ומגביל spam (מקס׳ 3 פרסומים/שעה)",
            "status": "active",
        },
        {
            "id": 3,
            "name": "SHIR",
            "icon": "✍️",
            "role": "יצירת תוכן",
            "description": "כותב עם Claude פוסט שיווקי בעברית לכל מוצר שאושר — כותרת, תיאור, 3 יתרונות, מחיר וקריאה לפעולה",
            "status": "active",
        },
        {
            "id": 4,
            "name": "PELEG",
            "icon": "📢",
            "role": "פרסום לטלגרם + וולט",
            "description": "שולח את הפוסט עם תמונת המוצר לערוץ SPORTIVI FOR YOU בטלגרם. שומר תיעוד בוולט Obsidian ומסד הנתונים.",
            "status": "active",
        },
        {
            "id": 5,
            "name": "ROMI",
            "icon": "📊",
            "role": "אנליטיקה",
            "description": "עוקב אחרי קליקים על קישורי Bitly, הכנסות AliExpress ומחשב ROI. מייצר דוח יומי לוולט בשעה 21:08.",
            "status": "active",
        },
        {
            "id": 6,
            "name": "AGAM",
            "icon": "🔔",
            "role": "ניטור בריאות",
            "description": "בודק 5 פרמטרים: טלגרם, AliExpress API, פרסומים היום, שיעור דחייה, ו-GitHub Actions. מתריע בטלגרם רק כשיש בעיה.",
            "status": "active",
        },
        {
            "id": 7,
            "name": "OLIVE",
            "icon": "🌿",
            "role": "אופטימיזציה",
            "description": "מנתחת ביצועי מילות מפתח עם Claude AI — מזהה קטגוריות מנצחות וכושלות, מייצרת המלצות ומעדכנת keywords.py.",
            "status": "scheduled",
        },
    ]

    schedule = [
        "09:00", "09:52", "10:44", "11:36", "12:28",
        "13:20", "14:12", "15:04", "15:56", "16:48",
        "17:40", "18:32", "19:24", "20:16", "21:08",
    ]

    settings = {
        "products_per_day": 15,
        "min_score": 45,
        "price_range": "$2–$80",
        "min_rating": "3.5★",
        "keywords_per_run": 3,
        "sort": "LAST_VOLUME_DESC",
        "platform": "GitHub Actions",
        "channel": "SPORTIVI FOR YOU",
        "click_tracking": "Bitly",
        "analytics_run": "21:08 (ROMI)",
        "monitor_runs": "09:00 + 21:08 (AGAM)",
    }

    recent_runs = []
    has_token = bool(github_token)

    if has_token:
        try:
            url = f"https://api.github.com/repos/{github_repo}/actions/runs?per_page=15"
            req = urllib.request.Request(url, headers={
                "Authorization": f"Bearer {github_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            })
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = _json.loads(resp.read().decode())
                for run in data.get("workflow_runs", []):
                    recent_runs.append({
                        "id": run["id"],
                        "name": run.get("display_title", run.get("name", "")),
                        "status": run["status"],
                        "conclusion": run.get("conclusion", ""),
                        "started_at": run.get("run_started_at", ""),
                        "url": run.get("html_url", ""),
                    })
        except Exception as e:
            recent_runs = [{"error": str(e)}]

    return {
        "agents": agents,
        "schedule": schedule,
        "settings": settings,
        "recent_runs": recent_runs,
        "has_token": has_token,
        "github_repo": github_repo,
        "actions_url": f"https://github.com/{github_repo}/actions",
    }


@app.route("/sportivi-status", methods=["GET"])
def sportivi_status():
    return jsonify(get_sportivi_status())


@app.route("/trigger-affiliate", methods=["GET", "POST"])
def trigger_affiliate():
    import urllib.request as _req
    import json as _json

    # Optional: protect with a key
    expected_key = os.environ.get("AFFILIATE_TRIGGER_KEY", "")
    if expected_key:
        provided = (
            request.args.get("key", "")
            or (request.get_json(silent=True) or {}).get("key", "")
        )
        if provided != expected_key:
            return jsonify({"status": "error", "message": "unauthorized"}), 401

    token = os.environ.get("GITHUB_TOKEN", "")
    repo = os.environ.get("GITHUB_REPO", "sportiviforyou-netizen/jarvis-affiliate")
    wf_id = os.environ.get("AFFILIATE_WF_ID", "273219086")

    if not token:
        return jsonify({
            "status": "error",
            "message": "GITHUB_TOKEN not set in Render environment variables"
        }), 500

    try:
        url = f"https://api.github.com/repos/{repo}/actions/workflows/{wf_id}/dispatches"
        body = _json.dumps({"ref": "master"}).encode()
        api_req = _req.Request(url, data=body, method="POST", headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        })
        with _req.urlopen(api_req, timeout=10) as r:
            return jsonify({
                "status": "ok",
                "message": f"Affiliate run triggered (HTTP {r.status})",
                "repo": repo,
            })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ── /ae-analytics response cache (30-min TTL) — GAP-14 fix ─────────────────
_ae_cache: dict = {}          # keys: data, expires_at
_AE_CACHE_TTL = 1800          # 30 minutes

@app.route("/ae-analytics", methods=["GET"])
def ae_analytics():
    """
    AliExpress Performance Center — real data only.
    Revenue / orders / clicks for today, this week, this month, total.
    Timezone: Asia/Jerusalem (DST-aware).
    Date boundaries: calendar day/week/month in Israel time.
    """
    import hashlib as _hlib
    import time    as _time
    import json    as _json
    import urllib.request as _req
    import urllib.parse   as _parse
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict

    import time as _time
    # ── 30-min cache check (GAP-14 fix) ──────────────────────────────────────
    if _ae_cache.get("data") and _ae_cache.get("expires_at", 0) > _time.time():
        return jsonify(_ae_cache["data"])

    ae_key    = os.environ.get("AE_APP_KEY",    "")
    ae_secret = os.environ.get("AE_APP_SECRET", "")
    bitly_tok = os.environ.get("BITLY_TOKEN",   "")

    if not ae_key or not ae_secret:
        return jsonify({"ok": False, "error": "AE_APP_KEY / AE_APP_SECRET not set",
                        "data": {}}), 503

    # ── DST-aware Israel timezone ─────────────────────────────────────────────
    try:
        from zoneinfo import ZoneInfo
        il_tz = ZoneInfo("Asia/Jerusalem")
    except ImportError:
        # Python < 3.9 fallback — UTC+3 (IDT summer). Winter is UTC+2.
        # If you see 1-hour errors in Oct–Mar, upgrade Python or install tzdata.
        il_tz = timezone(timedelta(hours=3))

    utc    = timezone.utc
    now_il = datetime.now(il_tz)

    # Calendar boundaries in Israel time
    today_start = now_il.replace(hour=0, minute=0, second=0, microsecond=0)
    # Monday of the current week
    week_start  = (now_il - timedelta(days=now_il.weekday())).replace(
                      hour=0, minute=0, second=0, microsecond=0)
    # First day of the current month
    month_start = now_il.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # Year-to-date (1 Jan of current year)
    year_start  = now_il.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    # ── AliExpress signing ────────────────────────────────────────────────────
    def _sign(p, secret):
        keys = sorted(p.keys())
        s = secret + "".join(f"{k}{p[k]}" for k in keys) + secret
        return _hlib.md5(s.encode()).hexdigest().upper()

    # ── Paginated order fetch (POST, UTC times) ───────────────────────────────
    def _fetch_orders(start_dt, end_dt):
        """Fetch all pages for a date range. Returns (orders_list, error_msg|None)."""
        fmt = "%Y-%m-%d %H:%M:%S"
        all_orders = []
        page = 1
        while True:
            p = {
                "method":      "aliexpress.affiliate.order.list",
                "app_key":     ae_key,
                "timestamp":   str(int(_time.time() * 1000)),
                "sign_method": "md5",
                "format":      "json",
                "v":           "2.0",
                "start_time":  start_dt.astimezone(utc).strftime(fmt),
                "end_time":    end_dt.astimezone(utc).strftime(fmt),
                "status":      "Payment Completed",
                "fields":      ("order_id,product_id,product_title,"
                               "estimated_paid_commission,paid_commission,"
                               "commission_rate,order_status,created_time,"
                               "tracking_id,settled_currency,ship_to_country"),
                "page_no":     str(page),
                "page_size":   "50",
            }
            p["sign"] = _sign(p, ae_secret)
            body = _parse.urlencode(p).encode("utf-8")
            try:
                req = _req.Request(
                    "https://api-sg.aliexpress.com/sync",
                    data=body,
                    headers={
                        "User-Agent":   "JARVIS/2.3",
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                )
                with _req.urlopen(req, timeout=15) as r:
                    data = _json.loads(r.read().decode())
                resp   = data.get("aliexpress_affiliate_order_list_response",
                                  {}).get("resp_result", {})
                if resp.get("resp_code") != 200:
                    err = resp.get("resp_msg", "AE API error")
                    return all_orders if all_orders else [], err
                result = resp.get("result", {})
                page_orders = result.get("orders", {}).get("order", [])
                page_orders = page_orders if isinstance(page_orders, list) else []
                all_orders.extend(page_orders)
                total   = int(result.get("total_record_count",   0))
                current = int(result.get("current_record_count", 0))
                # Stop when all orders fetched, or empty page, or safety limit
                if len(all_orders) >= total or current < 50 or page >= 10:
                    break
                page += 1
            except Exception as e:
                return all_orders if all_orders else [], str(e)
        return all_orders, None

    def _sum(orders, field):
        t = 0.0
        for o in orders:
            try: t += float(o.get(field) or 0)
            except: pass
        return round(t, 2)

    # ── Fetch order periods ───────────────────────────────────────────────────
    today_orders, today_err = _fetch_orders(today_start, now_il)
    week_orders,  week_err  = _fetch_orders(week_start,  now_il)
    month_orders, month_err = _fetch_orders(month_start, now_il)
    year_orders,  year_err  = _fetch_orders(year_start,  now_il)

    ILS = 3.7   # approximate USD→ILS

    # ── Commission sums ───────────────────────────────────────────────────────
    # AliExpress returns commission in cents (minor units) — divide by 100 to get USD
    today_est  = round(_sum(today_orders, "estimated_paid_commission") / 100, 2)
    week_est   = round(_sum(week_orders,  "estimated_paid_commission") / 100, 2)
    month_est  = round(_sum(month_orders, "estimated_paid_commission") / 100, 2)
    year_est   = round(_sum(year_orders,  "estimated_paid_commission") / 100, 2)
    month_paid = round(_sum(month_orders, "paid_commission")           / 100, 2)
    month_pend = max(round(month_est - month_paid, 2), 0.0)

    # Order status: approved = paid_commission > 0
    orders_approved = sum(1 for o in month_orders
                          if float(o.get("paid_commission") or 0) > 0)
    orders_pending  = len(month_orders) - orders_approved

    # ── Top 5 products this month ─────────────────────────────────────────────
    prod = defaultdict(lambda: {"comm": 0.0, "orders": 0, "name": ""})
    for o in month_orders:
        pid  = str(o.get("product_id", "?"))
        name = (o.get("product_title") or "Product")[:60]
        prod[pid]["name"]    = name
        prod[pid]["orders"] += 1
        try: prod[pid]["comm"] += float(o.get("estimated_paid_commission") or 0) / 100
        except: pass
    top_products = sorted(
        [{"id": k, "name": v["name"], "orders": v["orders"],
          "commission_usd": round(v["comm"], 2),
          "commission_ils": round(v["comm"] * ILS, 2)}
         for k, v in prod.items()],
        key=lambda x: x["commission_usd"], reverse=True
    )[:5]

    # ── Bitly clicks — by calendar period ────────────────────────────────────
    clicks_today = 0
    clicks_week  = 0
    clicks_month = 0
    clicks_total = 0
    if bitly_tok:
        try:
            import urllib.request as _br
            r = _br.urlopen(
                _br.Request(
                    "https://api-ssl.bitly.com/v4/groups",
                    headers={"Authorization": f"Bearer {bitly_tok}",
                             "Content-Type": "application/json"},
                ), timeout=8)
            gd = _json.loads(r.read())
            for g in (gd.get("groups") or []):
                guid = g.get("guid", "")
                if not guid:
                    continue
                # 90 days of daily data covers all periods
                cr = _br.urlopen(
                    _br.Request(
                        f"https://api-ssl.bitly.com/v4/groups/{guid}/clicks"
                        f"?units=90&unit=day",
                        headers={"Authorization": f"Bearer {bitly_tok}"}
                    ), timeout=8)
                cd = _json.loads(cr.read())
                today_str  = now_il.strftime("%Y-%m-%d")
                week_str   = week_start.strftime("%Y-%m-%d")
                month_str  = month_start.strftime("%Y-%m-%d")
                for item in (cd.get("link_clicks") or []):
                    # Bitly dates: "2026-05-14T00:00:00+0000" — take YYYY-MM-DD
                    day = (item.get("date") or "")[:10]
                    c   = item.get("clicks", 0)
                    clicks_total += c
                    if day == today_str:  clicks_today = c
                    if day >= week_str:   clicks_week  += c
                    if day >= month_str:  clicks_month += c
                break
        except Exception:
            pass

    # ── Build response ────────────────────────────────────────────────────────
    sync_ts = now_il.strftime("%Y-%m-%d %H:%M:%S (IL)")
    errors  = {k: v for k, v in [
        ("today", today_err), ("week", week_err),
        ("month", month_err), ("year", year_err),
    ] if v}

    # Store in cache (GAP-14 fix)
    import time as _time
    _response_payload = {
        "ok":  True,
        "data": {
            # ── Revenue (ILS & USD) ──────────────────────────────────────────
            "revenue_today_ils":  round(today_est * ILS, 2),
            "revenue_week_ils":   round(week_est  * ILS, 2),
            "revenue_month_ils":  round(month_est * ILS, 2),
            "revenue_year_ils":   round(year_est  * ILS, 2),
            "revenue_today_usd":  today_est,
            "revenue_week_usd":   week_est,
            "revenue_month_usd":  month_est,
            "revenue_year_usd":   year_est,
            # ── Commission breakdown ─────────────────────────────────────────
            "commission_estimated": month_est,
            "commission_approved":  month_paid,
            "commission_pending":   month_pend,
            # ── Orders ──────────────────────────────────────────────────────
            "orders_today":    len(today_orders),
            "orders_week":     len(week_orders),
            "orders_month":    len(month_orders),
            "orders_year":     len(year_orders),
            "orders_approved": orders_approved,
            "orders_pending":  orders_pending,
            # ── Clicks (Bitly) ───────────────────────────────────────────────
            "clicks_today":    clicks_today,
            "clicks_week":     clicks_week,
            "clicks_month":    clicks_month,
            "clicks_total":    clicks_total,
            # ── Conversion (month orders / month clicks) ──────────────────
            # GAP-42 fix (2026-05-18): return None when clicks_month = 0.
            # max(clicks_month, 1) was causing a false 100% conversion rate
            # whenever Bitly clicks were 0 but AliExpress orders > 0.
            "conversion_rate": (
                round(len(month_orders) / clicks_month * 100, 2)
                if clicks_month > 0 else None
            ),
            # ── Top products ─────────────────────────────────────────────────
            "top_products": top_products,
            # ── Meta ─────────────────────────────────────────────────────────
            "last_sync": sync_ts,
            "errors":    errors,
        }
    }
    _ae_cache["data"]       = _response_payload
    _ae_cache["expires_at"] = _time.time() + _AE_CACHE_TTL
    return jsonify(_response_payload)


@app.route("/trend-scan", methods=["POST"])
def trend_scan():
    """
    Real-time product trend intelligence via OpenAI web search.
    POST body: { "niches": ["yoga", "home workout", ...] }  — optional
    Returns structured trend objects for TALYA/OLIVE agents.
    """
    import json as _js
    data    = request.get_json(silent=True) or {}
    niches  = data.get("niches") or [
        "fitness equipment trending 2025",
        "sports gear viral TikTok AliExpress",
        "yoga accessories popular",
        "home workout equipment best sellers",
        "sportswear affordable trending Israel",
    ]
    model = os.environ.get("OPENAI_SEARCH_MODEL",
                           os.environ.get("OPENAI_MODEL", "gpt-4.1-mini"))

    system_prompt = (
        "You are a real-time market intelligence agent for SPORTIVI FOR YOU, "
        "an Israeli sports & fitness affiliate channel. "
        "Return ONLY valid JSON — no markdown, no prose."
    )
    user_prompt = (
        "Use live web search to find the most viral and trending sports/fitness products RIGHT NOW.\n"
        f"Search these niches: {', '.join(niches)}\n\n"
        "Return a JSON array of up to 10 objects, each with:\n"
        "  niche (string), product (string), keyword (string),\n"
        "  trend_direction ('viral'|'up'|'stable'|'down'),\n"
        "  virality_score (1–100), price_range (string, e.g. '$5–$25'),\n"
        "  why_trending (Hebrew, 1 short sentence),\n"
        "  source (URL or platform name)\n"
        "Return ONLY the JSON array."
    )

    try:
        for tool_type in ["web_search_preview", "web_search"]:
            try:
                resp = client.responses.create(
                    model=model,
                    tools=[{"type": tool_type}],
                    input=[{"role": "system", "content": system_prompt},
                           {"role": "user",   "content": user_prompt}],
                )
                raw   = (resp.output_text or "").strip()
                start = raw.find("["); end = raw.rfind("]") + 1
                if start >= 0 and end > start:
                    trends = _js.loads(raw[start:end])
                    return jsonify({
                        "ok":             True,
                        "trends":         trends,
                        "scanned_at":     datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "niches_scanned": len(niches),
                    })
                break
            except Exception:
                continue
        return jsonify({"ok": False, "error": "Trend scan failed — no valid JSON returned", "trends": []})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e), "trends": []}), 500


@app.route("/agent-logs", methods=["GET"])
def agent_logs():
    """
    Reads agent activity logs from GitHub Vault and returns Hebrew summary.
    Query params:
      agent  — TALIA | GAL | SHIR | PELEG | ROMI | AGAM | OLIVE | ANDY (optional)
      date   — YYYY-MM-DD (default: today Israel time)
      limit  — max records (default 30)
    """
    import urllib.request as _req2
    import urllib.error   as _uerr
    import json           as _js2
    import base64         as _b64
    import traceback      as _tb
    from datetime import datetime, timezone, timedelta

    try:
        agent_name   = (request.args.get("agent") or "").strip().upper()
        date_str     = (request.args.get("date")  or "").strip()
        limit        = min(int(request.args.get("limit") or 30), 100)
        github_token = os.environ.get("GITHUB_TOKEN", "")
        vault_repo   = os.environ.get("JARVIS_VAULT_REPO",
                                      "sportiviforyou-netizen/jarvis-vault")

        if not date_str:
            il_tz    = timezone(timedelta(hours=3))
            date_str = datetime.now(il_tz).strftime("%Y-%m-%d")

        def _gh(path):
            url = f"https://api.github.com/repos/{vault_repo}/contents/{path}"
            req = _req2.Request(url, headers={
                "Authorization": f"Bearer {github_token}",
                "Accept":        "application/vnd.github+json",
            })
            try:
                with _req2.urlopen(req, timeout=10) as r:
                    return _js2.loads(r.read().decode()), None
            except _uerr.HTTPError as e:
                return None, f"HTTP {e.code}"
            except Exception as e:
                return None, str(e)

        if not github_token:
            return jsonify({"ok": False, "error": "GITHUB_TOKEN not set",
                            "logs": [], "summary": "GitHub token חסר"}), 503

        dir_path = f"03_JARVIS_Data/Agent_Activity_Log/{date_str}"
        files, err = _gh(dir_path)

        if err or not isinstance(files, list):
            return jsonify({
                "ok":        True,
                "agent":     agent_name,
                "date":      date_str,
                "log_count": 0,
                "logs":      [],
                "summary":   (
                    f"אין פעילות רשומה"
                    + (f" ל-{agent_name}" if agent_name else "")
                    + f" בתאריך {date_str}"
                ),
            })

        logs = []
        for f in files:
            if not (f.get("type") == "file" and f.get("name", "").endswith(".json")):
                continue
            record, _ = _gh(f["path"])
            if not record:
                continue
            try:
                raw     = record.get("content", "").replace("\n", "")
                content = _b64.b64decode(raw).decode("utf-8")
                obj     = _js2.loads(content)
            except Exception:
                continue
            if agent_name and obj.get("agent", "").upper() != agent_name:
                continue
            logs.append(obj)

        logs.sort(key=lambda x: x.get("_ts", ""), reverse=True)
        logs = logs[:limit]

        completed = [l for l in logs if l.get("status") == "Completed"]
        failed    = [l for l in logs if l.get("status") == "Failed"]
        in_prog   = [l for l in logs if l.get("status") == "In Progress"]

        name_heb = agent_name or "כל הסוכנים"
        lines = [
            f"פעילות {name_heb} — {date_str}",
            f"סהכ: {len(logs)} | {len(completed)} הושלמו | {len(failed)} נכשלו | {len(in_prog)} בתהליך",
        ]
        for l in completed[:5]:
            ts  = (l.get("_ts") or l.get("timestamp") or "")[:16]
            act = l.get("action", "")
            det = (l.get("details") or "")[:80]
            lines.append(f"[{ts}] {act}" + (f" — {det}" if det else ""))
        for l in failed[:3]:
            lines.append(f"נכשל: {l.get('action', '')} — {(l.get('error') or '')[:60]}")

        return jsonify({
            "ok":        True,
            "agent":     agent_name,
            "date":      date_str,
            "log_count": len(logs),
            "logs":      logs,
            "summary":   "\n".join(lines),
        })

    except Exception as _err:
        return jsonify({
            "ok":    False,
            "error": str(_err),
            "trace": _tb.format_exc()[-1000:],
        }), 500


@app.route("/voice-transcribe", methods=["POST"])
def voice_transcribe():
    """
    STT: receives multipart audio file → OpenAI Whisper → returns {text}.
    Call with: fetch('/voice-transcribe', { method:'POST', body: formData })
    where formData.append('audio', audioBlob, 'recording.webm')
    """
    if "audio" not in request.files:
        return jsonify({"error": "No audio file in request"}), 400
    audio_file = request.files["audio"]
    if not audio_file.filename:
        audio_file.filename = "recording.webm"
    try:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=(audio_file.filename, audio_file.stream, audio_file.content_type or "audio/webm"),
            language="he",
        )
        return jsonify({"text": transcript.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/voice-tts", methods=["POST"])
def voice_tts():
    """
    TTS: receives {text} → OpenAI TTS (nova voice) → returns MP3 audio stream.
    """
    from flask import Response as _R
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()[:4096]
    if not text:
        return jsonify({"error": "No text provided"}), 400
    try:
        tts_resp = client.audio.speech.create(
            model="tts-1",
            voice="nova",        # nova = best for Hebrew
            input=text,
            response_format="mp3",
        )
        return _R(
            tts_resp.content,
            mimetype="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=response.mp3"},
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/voice", methods=["GET"])
def voice_page():
    return send_from_directory(BASE_DIR, "voice.html")


@app.route("/sportivi", methods=["GET"])
def sportivi():
    return send_from_directory(BASE_DIR, "sportivi.html")


@app.route("/dashboard", methods=["GET"])
def dashboard():
    # Approved SPORTIVI dashboard v2 (Hebrew RTL, real data via /api/vault/daily-summary)
    return send_from_directory(BASE_DIR, "sportivi_v2.html")


@app.route("/dashboard-old", methods=["GET"])
def dashboard_old():
    # Fallback: the previous Sportivi Dashboard on GitHub Pages
    from flask import redirect
    return redirect("https://sportiviforyou-netizen.github.io/jarvis-command-center/", code=302)


@app.route("/jarvis", methods=["GET"])
@app.route("/command-center", methods=["GET"])
def jarvis_interface():
    # Approved JARVIS main interface (command center — not a business dashboard)
    return send_from_directory(BASE_DIR, "jarvis.html")


@app.route("/telegram-members", methods=["GET"])
def telegram_members():
    """
    Returns live Telegram channel member count.
    Uses TELEGRAM_BOT_TOKEN + TELEGRAM_CHANNEL env vars (set on Render).
    Keeps the token server-side — never exposed to the browser.
    """
    import urllib.request as _tr
    import urllib.parse   as _tp
    import json as _tj

    token   = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    channel = os.environ.get("TELEGRAM_CHANNEL",   "")

    if not token or not channel:
        return jsonify({"ok": False,
                        "error": "TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL not set on Render"}), 503

    base = f"https://api.telegram.org/bot{token}"
    try:
        # getChatMemberCount
        url = f"{base}/getChatMemberCount?chat_id={_tp.quote(str(channel))}"
        with _tr.urlopen(_tr.Request(url), timeout=8) as r:
            count_data = _tj.loads(r.read())
        if not count_data.get("ok"):
            return jsonify({"ok": False, "error": count_data.get("description", "TG error")}), 502

        # getChat (for title / username)
        url2 = f"{base}/getChat?chat_id={_tp.quote(str(channel))}"
        with _tr.urlopen(_tr.Request(url2), timeout=8) as r2:
            chat_data = _tj.loads(r2.read())

        chat = chat_data.get("result", {})
        return jsonify({
            "ok":      True,
            "members": count_data["result"],
            "title":   chat.get("title", ""),
            "username": "@" + chat.get("username", "") if chat.get("username") else channel,
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502


@app.route("/pipeline-health", methods=["GET"])
def pipeline_health():
    """
    Returns live pipeline status from GitHub Vault (Pipeline_Health/<date>/*.json).
    The affiliate main.py writes a health record after every run.
    Used by the dashboard to show TALIA/GAL/SHIR/PELEG operational status.

    Query params:
      days  — how many past days to scan (default 2)
    """
    import urllib.request as _ph_req
    import urllib.error   as _ph_err
    import json           as _ph_js
    import base64         as _ph_b64
    from datetime import datetime, timezone, timedelta

    github_token = os.environ.get("GITHUB_TOKEN", "")
    vault_repo   = os.environ.get("JARVIS_VAULT_REPO",
                                  "sportiviforyou-netizen/jarvis-vault")

    if not github_token:
        return jsonify({"ok": False, "error": "GITHUB_TOKEN not set",
                        "runs": [], "summary": {}}), 503

    try:
        days = min(int(request.args.get("days", 2)), 7)
    except ValueError:
        days = 2

    il_tz   = timezone(timedelta(hours=3))
    today   = datetime.now(il_tz)
    dates   = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days)]

    def _gh(path):
        url = f"https://api.github.com/repos/{vault_repo}/contents/{path}"
        req = _ph_req.Request(url, headers={
            "Authorization": f"Bearer {github_token}",
            "Accept":        "application/vnd.github+json",
        })
        try:
            with _ph_req.urlopen(req, timeout=8) as r:
                return _ph_js.loads(r.read().decode()), None
        except _ph_err.HTTPError as e:
            return None, f"HTTP {e.code}"
        except Exception as e:
            return None, str(e)

    # Collect all run JSONs from the last <days> days
    runs = []
    for d in dates:
        folder_path = f"03_JARVIS_Data/Pipeline_Health/{d}"
        files, err  = _gh(folder_path)
        if err or not isinstance(files, list):
            continue
        for f in sorted(files, key=lambda x: x.get("name", ""), reverse=True)[:10]:
            if not (f.get("type") == "file" and f.get("name", "").endswith(".json")):
                continue
            rec, _ = _gh(f["path"])
            if not rec:
                continue
            try:
                raw     = rec.get("content", "").replace("\n", "")
                content = _ph_b64.b64decode(raw).decode("utf-8")
                obj     = _ph_js.loads(content)
                obj["_date"] = d
                runs.append(obj)
            except Exception:
                continue

    # Sort newest first
    runs.sort(key=lambda r: r.get("run_at", ""), reverse=True)

    # ── Build summary ────────────────────────────────────────────────────────
    last_success = next((r for r in runs if r.get("status") == "success"), None)
    last_failure = next((r for r in runs if r.get("status") == "failed"),  None)
    last_run     = runs[0] if runs else None

    # Per-agent status from the most recent run
    agent_status = {}
    if last_run:
        for stage, data in (last_run.get("stages") or {}).items():
            agent_status[stage] = {
                "status":    data.get("status", "unknown"),
                "detail":    data.get("detail", ""),
                "ts":        data.get("ts", ""),
                "run_status": last_run.get("status", "unknown"),
            }

    # Aggregate metrics from today's runs
    today_runs    = [r for r in runs if r.get("_date") == dates[0]]
    today_pub     = sum(r.get("metrics", {}).get("products_published", 0) for r in today_runs)
    today_disc    = sum(r.get("metrics", {}).get("products_discovered", 0) for r in today_runs)
    today_failed  = sum(1 for r in today_runs if r.get("status") == "failed")
    today_success = sum(1 for r in today_runs if r.get("status") == "success")

    # Active alerts = last run failed
    alerts = []
    if last_run and last_run.get("status") == "failed":
        fr = last_run.get("failure_reason", "Unknown reason")
        alerts.append({
            "type":    "critical",
            "msg":     f"Last pipeline run FAILED: {fr}",
            "ts":      last_run.get("run_at", ""),
        })

    return jsonify({
        "ok":   True,
        "summary": {
            "last_run_at":       last_run.get("run_at")    if last_run     else None,
            "last_run_status":   last_run.get("status")    if last_run     else "unknown",
            "last_success_at":   last_success.get("run_at") if last_success else None,
            "last_failure_at":   last_failure.get("run_at") if last_failure else None,
            "today_published":   today_pub,
            "today_discovered":  today_disc,
            "today_runs":        len(today_runs),
            "today_failed_runs": today_failed,
            "today_success_runs":today_success,
        },
        "agent_status":  agent_status,
        "alerts":        alerts,
        "recent_runs":   runs[:20],
    })


@app.route("/scheduled-agents-health", methods=["GET"])
def scheduled_agents_health():
    """
    Returns the latest health record for scheduled agents: ROMI, AGAM, OLIVE.
    Reads from jarvis-vault/03_JARVIS_Data/Scheduled_Agents_Health/YYYY-MM-DD.json.
    Written by run_romi() and run_agam() after each execution (GAP-07 fix).

    Used by AgentsPanel.jsx to show ok/fail status for agents that run on
    a separate schedule (not part of the main pipeline).

    Response:
      {
        "ok": true,
        "agents": {
          "ROMI":  {"status": "ok"|"fail", "detail": "...", "ts": "..."},
          "AGAM":  {"status": "ok"|"fail", "detail": "...", "ts": "..."},
          "OLIVE": {"status": "ok"|"fail", "detail": "...", "ts": "..."}
        },
        "date": "YYYY-MM-DD"
      }
    """
    import urllib.request as _sh_req
    import urllib.error   as _sh_err
    import json           as _sh_js
    import base64         as _sh_b64
    from datetime import datetime, timezone, timedelta

    github_token = os.environ.get("GITHUB_TOKEN", "")
    vault_repo   = os.environ.get("JARVIS_VAULT_REPO",
                                  "sportiviforyou-netizen/jarvis-vault")

    if not github_token:
        return jsonify({"ok": False, "error": "GITHUB_TOKEN not set",
                        "agents": {}}), 503

    il_tz    = timezone(timedelta(hours=3))
    today    = datetime.now(il_tz).strftime("%Y-%m-%d")
    yesterday = (datetime.now(il_tz) - timedelta(days=1)).strftime("%Y-%m-%d")

    def _read_day(date_str):
        path = f"03_JARVIS_Data/Scheduled_Agents_Health/{date_str}.json"
        url  = f"https://api.github.com/repos/{vault_repo}/contents/{path}"
        try:
            req = _sh_req.Request(url, headers={
                "Authorization": f"Bearer {github_token}",
                "Accept":        "application/vnd.github+json",
            })
            with _sh_req.urlopen(req, timeout=8) as r:
                raw  = _sh_js.loads(r.read())
                data = _sh_b64.b64decode(raw["content"].replace("\n", "")).decode("utf-8")
                return _sh_js.loads(data)
        except _sh_err.HTTPError as e:
            if e.code != 404:
                print(f"[scheduled-agents-health] HTTP {e.code}: {path}")
            return {}
        except Exception as e:
            print(f"[scheduled-agents-health] Error reading {date_str}: {e}")
            return {}

    # Try today first; fall back to yesterday if today has no data yet
    agents_data = _read_day(today)
    used_date   = today
    if not agents_data:
        agents_data = _read_day(yesterday)
        used_date   = yesterday

    return jsonify({
        "ok":     True,
        "agents": agents_data,  # {ROMI: {status, detail, ts}, AGAM: ..., OLIVE: ...}
        "date":   used_date,
    })


@app.route("/ping", methods=["GET"])
def ping():
    """Keepalive endpoint — called by dashboard every 5 min to prevent Render sleep."""
    return jsonify({"ok": True, "ts": datetime.now().isoformat(), "v": "p7"})


@app.route("/version", methods=["GET"])
def version():
    """Phase 6 deploy check — returns build version tag."""
    return jsonify({"ok": True, "phase": 7, "build": "2026-05-16-v2"})


@app.route("/ae-proxy", methods=["GET"])
def ae_proxy():
    """
    Server-side AliExpress API proxy.
    Adds signature + credentials without exposing them to the browser.
    Usage: GET /ae-proxy?method=aliexpress.affiliate.order.list&start_time=...
    """
    import urllib.request as _req
    import urllib.parse as _parse
    import hmac as _hmac
    import hashlib as _hashlib
    import time as _time
    import json as _json

    ae_key    = os.environ.get("AE_APP_KEY",    "")
    ae_secret = os.environ.get("AE_APP_SECRET", "")

    if not ae_key or not ae_secret:
        return jsonify({"error_response": {"msg": "AliExpress API not configured on server"}}), 503

    # Collect params from query string (excluding our server-injected ones)
    params = {k: v for k, v in request.args.items()}
    params["app_key"]     = ae_key
    params["timestamp"]   = str(int(_time.time() * 1000))
    params["sign_method"] = "md5"

    # Build MD5 signature (matches JARVIS agents signing method)
    sorted_keys = sorted(params.keys())
    sign_str    = ae_secret + "".join(f"{k}{params[k]}" for k in sorted_keys) + ae_secret
    sign        = _hashlib.md5(sign_str.encode("utf-8")).hexdigest().upper()
    params["sign"] = sign

    # order.list requires POST; product.query works with GET
    method_name = params.get("method", "")
    needs_post  = "order" in method_name

    try:
        if needs_post:
            body = _parse.urlencode(params).encode("utf-8")
            req  = _req.Request(
                "https://api-sg.aliexpress.com/sync",
                data=body,
                headers={
                    "User-Agent":   "JARVIS/2.3",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
        else:
            url = "https://api-sg.aliexpress.com/sync?" + _parse.urlencode(params)
            req = _req.Request(url, headers={"User-Agent": "JARVIS/2.3"})
        with _req.urlopen(req, timeout=12) as resp:
            data = _json.loads(resp.read().decode())
        response = jsonify(data)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response
    except Exception as e:
        return jsonify({"error_response": {"msg": str(e)}}), 502


@app.route("/vault-proxy", methods=["GET"])
def vault_proxy():
    """
    Proxy for private GitHub Vault reads.
    Adds GITHUB_TOKEN server-side — never exposes it to the browser.

    Query params:
      path — vault path (must start with 03_JARVIS_Data/, memory/, or 02_Business/)
      raw  — if "1", request raw file content (JSON) instead of GitHub API metadata
    """
    import urllib.request as _vp_req
    import urllib.error   as _vp_err
    import json           as _vp_js

    gh_token   = os.environ.get("GITHUB_TOKEN", "")
    vault_repo = "sportiviforyou-netizen/jarvis-vault"

    path = request.args.get("path", "").strip()
    raw  = request.args.get("raw", "0") == "1"

    # Validate path — only allow safe vault prefixes, block traversal
    allowed_prefixes = ("03_JARVIS_Data/", "memory/", "02_Business/")
    if not path:
        return jsonify({"error": "path required"}), 400
    if not any(path.startswith(p) for p in allowed_prefixes):
        return jsonify({"error": "path not allowed"}), 403
    if ".." in path or path.startswith("/"):
        return jsonify({"error": "invalid path"}), 400

    if not gh_token:
        return jsonify({"error": "GITHUB_TOKEN not configured on server"}), 503

    url = f"https://api.github.com/repos/{vault_repo}/contents/{path}"
    try:
        accept = "application/vnd.github.raw+json" if raw else "application/vnd.github+json"
        req = _vp_req.Request(url, headers={
            "Authorization":       f"Bearer {gh_token}",
            "Accept":              accept,
            "X-GitHub-Api-Version": "2022-11-28",
        })
        with _vp_req.urlopen(req, timeout=10) as r:
            content = r.read().decode("utf-8")

        if raw:
            # Raw mode: file bytes are the JSON record — parse and return
            try:
                data = _vp_js.loads(content)
            except Exception:
                data = {"content": content}
        else:
            data = _vp_js.loads(content)

        response = jsonify(data)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response

    except _vp_err.HTTPError as e:
        if e.code == 404:
            # Empty folder or missing file — return empty array (safe default)
            response = jsonify([])
            response.headers["Access-Control-Allow-Origin"] = "*"
            return response, 200
        return jsonify({"error": f"GitHub {e.code}"}), e.code
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/telegram-stats", methods=["GET"])
def telegram_stats():
    """
    Extended Telegram channel stats (superset of /telegram-members).
    Uses TELEGRAM_BOT_TOKEN + TELEGRAM_CHANNEL env vars (set on Render).
    Returns: { ok, members, title, username, description }
    """
    import urllib.request as _ts_req
    import urllib.parse   as _ts_p
    import json           as _ts_j

    token   = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    channel = os.environ.get("TELEGRAM_CHANNEL",   "")

    if not token or not channel:
        return jsonify({"ok": False,
                        "error": "TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL not set on Render"}), 503

    base = f"https://api.telegram.org/bot{token}"
    try:
        # getChatMemberCount
        url = f"{base}/getChatMemberCount?chat_id={_ts_p.quote(str(channel))}"
        with _ts_req.urlopen(_ts_req.Request(url), timeout=8) as r:
            count_data = _ts_j.loads(r.read())
        if not count_data.get("ok"):
            return jsonify({"ok": False, "error": count_data.get("description", "TG error")}), 502

        # getChat (for title / username / description)
        url2 = f"{base}/getChat?chat_id={_ts_p.quote(str(channel))}"
        with _ts_req.urlopen(_ts_req.Request(url2), timeout=8) as r2:
            chat_data = _ts_j.loads(r2.read())

        chat = chat_data.get("result", {})
        return jsonify({
            "ok":          True,
            "members":     count_data["result"],
            "title":       chat.get("title", ""),
            "username":    "@" + chat.get("username", "") if chat.get("username") else channel,
            "description": chat.get("description", ""),
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502


@app.route("/ae-status", methods=["GET"])
def ae_status():
    """
    AliExpress API configuration status.
    Returns whether AE credentials are configured — without exposing key values.
    """
    ae_key    = os.environ.get("AE_APP_KEY",    "")
    ae_secret = os.environ.get("AE_APP_SECRET", "")
    return jsonify({
        "ok":         True,
        "configured": bool(ae_key and ae_secret),
    })


@app.route("/", methods=["GET"])
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(BASE_DIR, filename)


@app.route("/command-stream", methods=["POST"])
def handle_command_stream():
    """SSE endpoint — streams AI response token-by-token for real-time display."""
    import json as _json_s
    from flask import stream_with_context, Response as _Response

    data = request.get_json(silent=True) or {}
    command = data.get("command", "")

    def _evt(obj):
        return f"data: {_json_s.dumps(obj, ensure_ascii=False)}\n\n"

    @stream_with_context
    def generate():
        if not command:
            yield _evt({"error": "לא התקבלה פקודה.", "done": True})
            return

        action_url  = detect_action_url(command)
        action_type = route_command(command)

        # ── Special memory commands (instant, no AI needed) ──────
        if is_memory_show_command(command):
            yield _evt({"text": build_memory_show_response(command), "done": True, "action_url": None})
            return

        if is_memory_delete_command(command):
            delete_text = extract_memory_delete_text(command)
            yield _evt({"text": build_memory_delete_response(delete_text), "done": True, "action_url": None})
            return

        if is_memory_save_command(command):
            memory_text = extract_memory_text(command)
            if not memory_text or looks_like_secret(memory_text):
                yield _evt({"error": "לא ניתן לשמור — תוכן חסר או רגיש.", "done": True})
                return
            mf = choose_memory_file(memory_text)
            append_memory_item(mf, memory_text)
            yield _evt({"text": f"נשמר בזיכרון.\nקובץ: memory/{mf}\nתוכן: {memory_text}", "done": True, "action_url": None})
            return

        if approval_requested(command):
            yield _evt({"text": "נדרש אישורך לפני ביצוע הפעולה הזו.", "done": True, "action_url": None})
            return

        # ── Agent activity log query ──────────────────────────────
        agent_q, is_agent_q = detect_agent_log_query(command)
        if is_agent_q:
            import urllib.request as _aq
            import json as _ajs
            try:
                params = f"?agent={agent_q}" if agent_q else ""
                url = f"http://127.0.0.1:{os.environ.get('PORT', 10000)}/agent-logs{params}"
                with _aq.urlopen(url, timeout=15) as r:
                    ld = _ajs.loads(r.read().decode())
                summary = ld.get("summary", "לא נמצאה פעילות.")
                yield _evt({"text": summary, "done": True, "action_url": None})
            except Exception as e:
                yield _evt({"text": f"לא הצלחתי לשלוף לוגים: {e}", "done": True, "action_url": None})
            return

        # ── Stream AI response ────────────────────────────────────
        system_prompt, user_prompt = build_openai_context(command, action_type)
        model = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
        use_search = should_use_web_search(command, action_type)

        try:
            kwargs = dict(
                model=model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
                stream=True,
            )
            if use_search:
                # Try web_search_preview first, fall back to web_search
                for tool_type in ["web_search_preview", "web_search"]:
                    try:
                        kwargs["tools"] = [{"type": tool_type}]
                        stream = client.responses.create(**kwargs)
                        for event in stream:
                            if getattr(event, "type", "") == "response.output_text.delta":
                                delta = getattr(event, "delta", "")
                                if delta:
                                    yield _evt({"text": delta})
                        break
                    except Exception:
                        continue
            else:
                kwargs.pop("tools", None)
                stream = client.responses.create(**kwargs)
                for event in stream:
                    if getattr(event, "type", "") == "response.output_text.delta":
                        delta = getattr(event, "delta", "")
                        if delta:
                            yield _evt({"text": delta})

            yield _evt({"done": True, "action_url": action_url})

        except Exception as exc:
            yield _evt({"error": str(exc), "done": True, "action_url": action_url})

    return _Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering":"no",
            "Connection":       "keep-alive",
        },
    )


@app.route("/command", methods=["POST"])
def handle_command():
    data = request.get_json(silent=True) or {}
    command = data.get("command", "")

    if not command:
        return jsonify({
            "status": "error",
            "reply": "לא התקבלה פקודה.",
            "action_url": None
        }), 400

    action_url = detect_action_url(command)
    action_type = route_command(command)

    if is_memory_show_command(command):
        return jsonify({
            "status": "success",
            "reply": build_memory_show_response(command),
            "next_step": "זהו הזיכרון הנוכחי ש-Jarvis משתמש בו כהקשר.",
            "action_url": None
        })

    if is_memory_delete_command(command):
        delete_text = extract_memory_delete_text(command)
        return jsonify({
            "status": "success",
            "reply": build_memory_delete_response(delete_text),
            "next_step": "לא בוצעה מחיקה. נדרש אישור מפורש לפני מחיקה בפועל.",
            "action_url": None
        })

    if is_memory_save_command(command):
        memory_text = extract_memory_text(command)

        if not memory_text:
            return jsonify({
                "status": "error",
                "reply": "לא נמצא תוכן לשמירה בזיכרון.",
                "next_step": None,
                "action_url": None
            }), 400

        if looks_like_secret(memory_text):
            return jsonify({
                "status": "error",
                "reply": "לא שמרתי את זה בזיכרון כי זה נראה כמו מידע רגיש או סודי.",
                "next_step": None,
                "action_url": None
            }), 400

        memory_file = choose_memory_file(memory_text)
        append_memory_item(memory_file, memory_text)

        return jsonify({
            "status": "success",
            "reply": f"נשמר כעדכון חדש בזיכרון.\nקובץ: memory/{memory_file}\nתוכן: {memory_text}",
            "next_step": "הזיכרון יעבור להקשר של Jarvis בבקשות הבאות.",
            "action_url": None
        })

    try:
        if should_use_web_search(command, action_type):
            ai_reply = ask_openai_with_web_search(command, action_type)
            next_step = "הפקודה טופלה עם כלי חיפוש חי של OpenAI."
        else:
            ai_reply = ask_openai_brain(command, action_type)
            next_step = "הפקודה טופלה על ידי מוח OpenAI."

        reply = f"""
Brain version: {BRAIN_VERSION}
Active brain: {ACTIVE_BRAIN}
Detected action type: {action_type}

Final Jarvis answer:
{ai_reply}
"""

        return jsonify({
            "status": "success",
            "reply": reply,
            "next_step": next_step,
            "action_url": action_url
        })

    except Exception as e:
        error_message = str(e)

        return jsonify({
            "status": "error",
            "reply": f"""
שגיאה בחיבור למוח OpenAI.

מה לבדוק:
1. שקיים ב-Render משתנה OPENAI_API_KEY.
2. שהמפתח תקין.
3. שיש לחשבון OpenAI הרשאת API פעילה.
4. שהמודל שהוגדר קיים וזמין בחשבון שלך.
5. שב-requirements.txt מופיעה הספרייה openai.
6. שעשית Deploy latest commit אחרי השינויים.

פירוט שגיאה:
{error_message}
""",
            "action_url": action_url
        }), 500


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6 — Runtime Harness Endpoints  (deployed 2026-05-16)
# Read-only vault consumers: no jarvis-affiliate import needed.
# Same inline GitHub API pattern as /pipeline-health above.
# ─────────────────────────────────────────────────────────────────────────────

def _vault_get(path: str, token: str, vault_repo: str):
    """Inline vault file reader — same pattern as /pipeline-health."""
    import urllib.request as _vr
    import urllib.error   as _ve
    import json as _vj
    url = f"https://api.github.com/repos/{vault_repo}/contents/{path}"
    req = _vr.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept":        "application/vnd.github+json",
    })
    try:
        with _vr.urlopen(req, timeout=8) as r:
            return _vj.loads(r.read().decode()), None
    except _ve.HTTPError as e:
        return None, f"HTTP {e.code}"
    except Exception as e:
        return None, str(e)


def _decode_b64(raw_dict):
    """Decode base64 vault content to parsed JSON."""
    import base64 as _b64
    import json   as _j
    try:
        content = _b64.b64decode(raw_dict.get("content", "").replace("\n", "")).decode("utf-8")
        return _j.loads(content)
    except Exception:
        return None


@app.route("/runtime-status", methods=["GET"])
def runtime_status():
    """
    Returns agent runtime state from last N pipeline runs.
    Reads from vault: 03_JARVIS_Data/Runtime_State/YYYY-MM-DD.json
    Query params: days (default 1, max 7)
    """
    from datetime import datetime, timezone, timedelta
    import json as _j
    github_token = os.environ.get("GITHUB_TOKEN", "")
    vault_repo   = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")

    if not github_token:
        return jsonify({"ok": False, "error": "GITHUB_TOKEN not set", "runs": []}), 503

    try:
        days = min(int(request.args.get("days", 1)), 7)
    except ValueError:
        days = 1

    il_tz = timezone(timedelta(hours=3))
    all_runs = {}

    for i in range(days):
        date_str = (datetime.now(il_tz) - timedelta(days=i)).strftime("%Y-%m-%d")
        path = f"03_JARVIS_Data/Runtime_State/{date_str}.json"
        raw, err = _vault_get(path, github_token, vault_repo)
        if raw and not err:
            data = _decode_b64(raw)
            if data and isinstance(data, dict):
                all_runs.update(data)

    # Sort runs newest-first
    sorted_runs = sorted(all_runs.values(),
                         key=lambda r: r.get("run_id", ""),
                         reverse=True)

    last_run = sorted_runs[0] if sorted_runs else {}

    return jsonify({
        "ok":        True,
        "total_runs": len(all_runs),
        "last_run_id": last_run.get("run_id"),
        "last_run_at": last_run.get("run_at"),
        "runs":      sorted_runs[:20],
    })


@app.route("/runtime-queue", methods=["GET"])
def runtime_queue():
    """
    Returns pipeline job queue status from vault.
    Reads from vault: 03_JARVIS_Data/Runtime_Queue/YYYY-MM-DD.json
    Query params: days (default 1, max 7)
    """
    from datetime import datetime, timezone, timedelta
    github_token = os.environ.get("GITHUB_TOKEN", "")
    vault_repo   = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")

    if not github_token:
        return jsonify({"ok": False, "error": "GITHUB_TOKEN not set", "jobs": {}}), 503

    try:
        days = min(int(request.args.get("days", 1)), 7)
    except ValueError:
        days = 1

    il_tz = timezone(timedelta(hours=3))
    all_jobs = {}

    for i in range(days):
        date_str = (datetime.now(il_tz) - timedelta(days=i)).strftime("%Y-%m-%d")
        path = f"03_JARVIS_Data/Runtime_Queue/{date_str}.json"
        raw, err = _vault_get(path, github_token, vault_repo)
        if raw and not err:
            data = _decode_b64(raw)
            if data and isinstance(data, dict):
                all_jobs.update(data)

    # Aggregate state counts
    states = {"queued": 0, "running": 0, "completed": 0,
              "failed": 0, "retrying": 0, "cancelled": 0}
    for job in all_jobs.values():
        s = job.get("state", "unknown")
        states[s] = states.get(s, 0) + 1

    # Jobs sorted newest-first
    sorted_jobs = sorted(all_jobs.values(),
                         key=lambda j: j.get("enqueued_at", ""),
                         reverse=True)

    return jsonify({
        "ok":        True,
        "total_jobs": len(all_jobs),
        "states":    states,
        "jobs":      sorted_jobs[:50],
    })


@app.route("/ai-routing-log", methods=["GET"])
def ai_routing_log():
    """
    Returns AI routing decisions and statistics from vault.
    Reads from vault: 03_JARVIS_Data/AI_Routing/YYYY-MM-DD.json
    Query params: days (default 1, max 7)
    """
    from datetime import datetime, timezone, timedelta
    github_token = os.environ.get("GITHUB_TOKEN", "")
    vault_repo   = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")

    if not github_token:
        return jsonify({"ok": False, "error": "GITHUB_TOKEN not set", "entries": []}), 503

    try:
        days = min(int(request.args.get("days", 1)), 7)
    except ValueError:
        days = 1

    il_tz = timezone(timedelta(hours=3))
    all_entries = []

    for i in range(days):
        date_str = (datetime.now(il_tz) - timedelta(days=i)).strftime("%Y-%m-%d")
        path = f"03_JARVIS_Data/AI_Routing/{date_str}.json"
        raw, err = _vault_get(path, github_token, vault_repo)
        if raw and not err:
            data = _decode_b64(raw)
            if data and isinstance(data, list):
                all_entries.extend(data)

    total    = len(all_entries)
    success  = sum(1 for e in all_entries if e.get("success"))
    failures = total - success
    fallback = sum(1 for e in all_entries if e.get("fallback"))
    avg_lat  = (sum(e.get("latency_ms", 0) for e in all_entries) // total) if total else 0

    # Per-agent stats
    by_agent = {}
    for e in all_entries:
        ag = e.get("agent", "unknown")
        if ag not in by_agent:
            by_agent[ag] = {"calls": 0, "success": 0, "fallback": 0}
        by_agent[ag]["calls"]    += 1
        by_agent[ag]["success"]  += int(e.get("success", False))
        by_agent[ag]["fallback"] += int(e.get("fallback", False))

    return jsonify({
        "ok":              True,
        "total":           total,
        "success":         success,
        "failures":        failures,
        "fallback":        fallback,
        "avg_latency_ms":  avg_lat,
        "success_rate":    round(success / total, 3) if total else 0,
        "by_agent":        by_agent,
        "entries":         all_entries[-50:],  # last 50
    })


@app.route("/runtime-metrics", methods=["GET"])
def runtime_metrics():
    """
    Returns aggregated runtime performance metrics from vault.
    Reads: Pipeline_Health, Published_Index, AI_Routing, Runtime_State.
    Query params: days (default 7, max 30)
    """
    from datetime import datetime, timezone, timedelta
    import json as _j

    github_token = os.environ.get("GITHUB_TOKEN", "")
    vault_repo   = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")

    if not github_token:
        return jsonify({"ok": False, "error": "GITHUB_TOKEN not set"}), 503

    try:
        days = min(int(request.args.get("days", 7)), 30)
    except ValueError:
        days = 7

    il_tz = timezone(timedelta(hours=3))
    now   = datetime.now(il_tz)

    # ── Pipeline_Health files ─────────────────────────────────────────────────
    health_records = []
    for i in range(days):
        date_str = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        dir_path = f"03_JARVIS_Data/Pipeline_Health/{date_str}"
        files, err = _vault_get(dir_path, github_token, vault_repo)
        if err or not isinstance(files, list):
            continue
        for f in files:
            if not f.get("name", "").endswith(".json"):
                continue
            rec, _ = _vault_get(f["path"], github_token, vault_repo)
            if not rec:
                continue
            data = _decode_b64(rec)
            if data and isinstance(data, dict):
                health_records.append(data)

    # ── Published index counts ────────────────────────────────────────────────
    total_published = 0
    published_24h   = 0
    cutoff_24h      = now - timedelta(hours=24)

    for i in range(days):
        date_str = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        path = f"03_JARVIS_Data/Published_Index/{date_str}.json"
        raw, err = _vault_get(path, github_token, vault_repo)
        if raw and not err:
            data = _decode_b64(raw)
            if isinstance(data, list):
                total_published += len(data)
                for rec in data:
                    pt = rec.get("publish_time", "")
                    if pt:
                        try:
                            pub_dt = datetime.strptime(pt, "%Y-%m-%d %H:%M").replace(tzinfo=il_tz)
                            if pub_dt >= cutoff_24h:
                                published_24h += 1
                        except Exception:
                            pass

    # ── AI Routing stats ──────────────────────────────────────────────────────
    ai_entries = []
    for i in range(days):
        date_str = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        path = f"03_JARVIS_Data/AI_Routing/{date_str}.json"
        raw, err = _vault_get(path, github_token, vault_repo)
        if raw and not err:
            data = _decode_b64(raw)
            if isinstance(data, list):
                ai_entries.extend(data)

    ai_total    = len(ai_entries)
    ai_success  = sum(1 for e in ai_entries if e.get("success"))
    ai_fallback = sum(1 for e in ai_entries if e.get("fallback"))
    avg_latency = (sum(e.get("latency_ms", 0) for e in ai_entries) // ai_total) if ai_total else 0

    # ── Aggregate pipeline stats ──────────────────────────────────────────────
    total_runs   = len(health_records)
    successful   = sum(1 for r in health_records if r.get("status") == "success")
    failed_runs  = total_runs - successful
    success_rate = round(successful / total_runs, 3) if total_runs else 0

    sorted_records = sorted(health_records, key=lambda r: r.get("run_at", ""), reverse=True)
    last_run     = sorted_records[0] if sorted_records else {}
    today_str    = now.strftime("%Y-%m-%d")
    today_records = [r for r in health_records if r.get("run_at", "")[:10] == today_str]
    ai_fails_today = sum(r.get("metrics", {}).get("ai_failures", 0) for r in today_records)

    # Pipeline health color
    if success_rate >= 0.9 and published_24h >= 1 and ai_fails_today == 0:
        health_color = "green"
    elif success_rate >= 0.7 and published_24h >= 1:
        health_color = "yellow"
    elif total_runs == 0:
        health_color = "yellow"
    else:
        health_color = "red"

    return jsonify({
        "ok":                    True,
        "period_days":           days,
        "total_runs":            total_runs,
        "successful_runs":       successful,
        "failed_runs":           failed_runs,
        "success_rate":          success_rate,
        "total_published":       total_published,
        "avg_published_per_run": round(total_published / max(total_runs, 1), 2),
        "total_ai_calls":        ai_total,
        "ai_success_rate":       round(ai_success / ai_total, 3) if ai_total else 0,
        "fallback_percentage":   round(ai_fallback / ai_total, 3) if ai_total else 0,
        "avg_latency_ms":        avg_latency,
        "publish_rate_24h":      published_24h,
        "last_run_at":           last_run.get("run_at", ""),
        "last_run_status":       last_run.get("status", "unknown"),
        "last_published":        last_run.get("metrics", {}).get("products_published", 0),
        "ai_failures_today":     ai_fails_today,
        "pipeline_health":       health_color,
    })


@app.route("/watchdog-status", methods=["GET"])
def watchdog_status():
    """
    Returns today's watchdog alert history (which alerts fired today).
    Reads from vault: 03_JARVIS_Data/Watchdog_Alerts/YYYY-MM-DD_fired.json
    """
    from datetime import datetime, timezone, timedelta
    github_token = os.environ.get("GITHUB_TOKEN", "")
    vault_repo   = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")

    if not github_token:
        return jsonify({"ok": False, "error": "GITHUB_TOKEN not set", "alerts_fired": {}}), 503

    il_tz    = timezone(timedelta(hours=3))
    today    = datetime.now(il_tz).strftime("%Y-%m-%d")
    path     = f"03_JARVIS_Data/Watchdog_Alerts/{today}_fired.json"
    raw, err = _vault_get(path, github_token, vault_repo)

    if raw and not err:
        data = _decode_b64(raw)
        if data and isinstance(data, dict):
            return jsonify({
                "ok":          True,
                "date":        today,
                "alerts_fired": data,
                "count":       len(data),
            })

    return jsonify({
        "ok":          True,
        "date":        today,
        "alerts_fired": {},
        "count":       0,
        "note":        "No watchdog alerts fired today",
    })


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 7 — Internet Intelligence Endpoints
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/trend-intelligence")
def trend_intelligence():
    """
    Return today's intelligence cache: Google Trends + Reddit + AliExpress synthesis.
    Query: ?days=N (default 3) to include recent days if today's cache is empty or missing.
    Default is 3: covers today + 2 past days, handling weekend gaps or skipped Intel runs.
    Loop exits immediately on first valid cache found — no wasted vault calls.
    """
    token      = os.environ.get("GITHUB_TOKEN", "")
    vault_repo = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")
    days = max(1, min(int(request.args.get("days", 3)), 7))
    tz   = timezone(timedelta(hours=3))

    for i in range(days):
        date_str = (datetime.now(tz) - timedelta(days=i)).strftime("%Y-%m-%d")
        path = f"03_JARVIS_Data/Intel_Cache/{date_str}.json"
        raw, err = _vault_get(path, token, vault_repo)
        if not raw or err:
            continue
        data = _decode_b64(raw)
        if not data:
            continue

        synthesis = data.get("synthesis", {})
        stats     = data.get("stats", {})
        return jsonify({
            "ok":                True,
            "date":              date_str,
            "generated_at":      data.get("generated_at", ""),
            "opportunity_score": synthesis.get("opportunity_score", 0),
            "recommended_focus": synthesis.get("recommended_focus", ""),
            "confidence":        synthesis.get("confidence", ""),
            "summary":           synthesis.get("summary", ""),
            "hot_categories":    synthesis.get("hot_categories", []),
            "rising_signals":    synthesis.get("rising_signals", []),
            "stats":             stats,
        })

    return jsonify({
        "ok":    False,
        "error": "No intelligence cache found",
        "days_checked": days,
    }), 404


@app.route("/keyword-intelligence")
def keyword_intelligence():
    """
    Return the top opportunity keywords from today's intel cache.
    Query: ?days=N (default 1)
    """
    token      = os.environ.get("GITHUB_TOKEN", "")
    vault_repo = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")
    days = max(1, min(int(request.args.get("days", 1)), 7))
    tz   = timezone(timedelta(hours=3))

    for i in range(days):
        date_str = (datetime.now(tz) - timedelta(days=i)).strftime("%Y-%m-%d")
        path = f"03_JARVIS_Data/Intel_Cache/{date_str}.json"
        raw, err = _vault_get(path, token, vault_repo)
        if not raw or err:
            continue
        data = _decode_b64(raw)
        if not data:
            continue

        top_kws   = data.get("top_keywords", [])
        scored    = data.get("opportunity_scores", [])
        synthesis = data.get("synthesis", {})
        return jsonify({
            "ok":                 True,
            "date":               date_str,
            "generated_at":       data.get("generated_at", ""),
            "top_keywords":       top_kws,
            "opportunity_scores": scored[:10],
            "total_scored":       len(scored),
            "synthesis_keywords": synthesis.get("top_keywords", []),
        })

    # Fall back to trending.json feed
    raw, err = _vault_get("03_JARVIS_Data/Intel_Keywords/trending.json", token, vault_repo)
    if raw and not err:
        data = _decode_b64(raw)
        if data:
            return jsonify({
                "ok":           True,
                "source":       "keyword_feed",
                "generated_at": data.get("generated_at", ""),
                "top_keywords": data.get("keywords", []),
                "confidence":   data.get("confidence", ""),
            })

    return jsonify({
        "ok":    False,
        "error": "No keyword intelligence found",
    }), 404


@app.route("/opportunity-feed")
def opportunity_feed():
    """
    Return keyword opportunity scores from the latest intel run.
    Query: ?min_score=N (default 20) to filter low-score keywords.
    """
    token      = os.environ.get("GITHUB_TOKEN", "")
    vault_repo = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")
    min_score  = int(request.args.get("min_score", 20))
    tz         = timezone(timedelta(hours=3))

    for i in range(3):
        date_str = (datetime.now(tz) - timedelta(days=i)).strftime("%Y-%m-%d")
        path = f"03_JARVIS_Data/Intel_Cache/{date_str}.json"
        raw, err = _vault_get(path, token, vault_repo)
        if not raw or err:
            continue
        data = _decode_b64(raw)
        if not data:
            continue

        all_scores = data.get("opportunity_scores", [])
        filtered   = [s for s in all_scores if s.get("opportunity", 0) >= min_score]
        hot_kws    = [s["keyword"] for s in filtered if s.get("label") == "hot"]
        warm_kws   = [s["keyword"] for s in filtered if s.get("label") == "warm"]
        synthesis  = data.get("synthesis", {})

        return jsonify({
            "ok":                True,
            "date":              date_str,
            "generated_at":      data.get("generated_at", ""),
            "min_score_filter":  min_score,
            "total_scored":      len(all_scores),
            "qualifying":        len(filtered),
            "hot":               hot_kws,
            "warm":              warm_kws,
            "opportunity_score": synthesis.get("opportunity_score", 0),
            "recommended_focus": synthesis.get("recommended_focus", ""),
            "scores":            filtered,
        })

    return jsonify({
        "ok":    False,
        "error": "No opportunity data found (last 3 days)",
    }), 404


@app.route("/research-status")
def research_status():
    """
    Return INTEL agent health + last run summary.
    Shows whether the intelligence pipeline ran today and its key metrics.
    """
    token      = os.environ.get("GITHUB_TOKEN", "")
    vault_repo = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")
    tz         = timezone(timedelta(hours=3))
    today      = datetime.now(tz).strftime("%Y-%m-%d")

    # Check INTEL health record (written by health_monitor to Scheduled_Agents_Health)
    health_raw, _ = _vault_get(
        f"03_JARVIS_Data/Scheduled_Agents_Health/{today}.json", token, vault_repo
    )
    health_all  = _decode_b64(health_raw) if health_raw else {}
    health_data = health_all.get("INTEL") if isinstance(health_all, dict) else None

    # Check intel cache
    cache_raw, _ = _vault_get(
        f"03_JARVIS_Data/Intel_Cache/{today}.json", token, vault_repo
    )
    cache_data = _decode_b64(cache_raw) if cache_raw else None

    # Check keywords feed
    kw_raw, _ = _vault_get(
        "03_JARVIS_Data/Intel_Keywords/trending.json", token, vault_repo
    )
    kw_data = _decode_b64(kw_raw) if kw_raw else None

    ran_today = cache_data is not None
    kw_ready  = kw_data is not None and len(kw_data.get("keywords", [])) > 0

    result = {
        "ok":              True,
        "date":            today,
        "intel_ran_today": ran_today,
        "keywords_ready":  kw_ready,
        "health":          health_data,
        "cache_stats":     cache_data.get("stats") if cache_data else None,
        "keyword_feed": {
            "count":        len(kw_data.get("keywords", [])),
            "generated_at": kw_data.get("generated_at", ""),
            "confidence":   kw_data.get("confidence", ""),
            "sample":       kw_data.get("keywords", [])[:5],
        } if kw_data else None,
    }

    if not ran_today:
        result["warning"] = "INTEL has not run today — TALIA using static keywords"

    return jsonify(result)


# ─────────────────────────────────────────────────────────────────────────────
# GARVIS INTERNAL TRACKER  (GAP-39)
# Replaces Bitly as the primary click-tracking provider.
#
# Architecture:
#   Telegram post → GARVIS /r/<tracking_id> → records click → 302 redirect
#
# Vault storage:
#   03_JARVIS_Data/Link_Registry/YYYY-MM-DD.json  — registered links
#   03_JARVIS_Data/Click_Events/YYYY-MM-DD.json   — per-click events
#
# Security:
#   - Only redirects to approved AliExpress affiliate domains (open-redirect safe).
#   - Does NOT store raw IP addresses (SHA-256 prefix only).
#   - tracking_id validated as 6-24 alphanumeric chars.
#   - No secrets returned in any endpoint response.
# ─────────────────────────────────────────────────────────────────────────────

_TRACKER_ALLOWED_DOMAINS = (
    "s.click.aliexpress.com",
    "aliexpress.com",
    "www.aliexpress.com",
    "aliexpress.us",
    "a.aliexpress.com",
    "uii.aliexpress.com",
)


def _tr_read_file(path: str, token: str, vault_repo: str):
    """
    Read a JSON-array vault file via GitHub Contents API.
    Returns (list, sha) or ([], '') on 404/error.
    """
    import urllib.request as _ur
    import urllib.error   as _ue
    import base64         as _ub

    if not token:
        return [], ""
    url = f"https://api.github.com/repos/{vault_repo}/contents/{path}"
    try:
        req = _ur.Request(url, headers={
            "Authorization": f"Bearer {token}",
            "Accept":        "application/vnd.github+json",
        })
        with _ur.urlopen(req, timeout=8) as r:
            meta = json.loads(r.read().decode())
        sha  = meta.get("sha", "")
        raw  = _ub.b64decode(meta.get("content", "").replace("\n", "")).decode("utf-8")
        data = json.loads(raw)
        return (data if isinstance(data, list) else []), sha
    except _ue.HTTPError as e:
        if e.code == 404:
            return [], ""
        return [], f"HTTP {e.code}"
    except Exception as e:
        return [], str(e)


def _tr_write_file(path: str, records: list, message: str,
                   token: str, vault_repo: str, sha: str = "") -> bool:
    """Write (create or update) a JSON-array vault file. Returns True on success."""
    import urllib.request as _uw
    import base64         as _ub

    if not token:
        return False
    body = {
        "message": message,
        "content": _ub.b64encode(
            json.dumps(records, ensure_ascii=False, indent=2).encode()
        ).decode(),
    }
    if sha:
        body["sha"] = sha
    url = f"https://api.github.com/repos/{vault_repo}/contents/{path}"
    try:
        req = _uw.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            method="PUT",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept":        "application/vnd.github+json",
                "Content-Type":  "application/json",
            },
        )
        with _uw.urlopen(req, timeout=15) as r:
            return r.status in (200, 201)
    except Exception as e:
        print(f"[Tracker] vault write error: {e}")
        return False


def _tr_lookup_link(tracking_id: str, token: str, vault_repo: str, days: int = 30) -> dict:
    """
    Scan Link_Registry for the given tracking_id (last N days).
    Checks most-recent days first for speed.
    Returns the registry record or {} if not found.
    """
    for i in range(days):
        date_str = (datetime.now(timezone(timedelta(hours=3))) - timedelta(days=i)).strftime("%Y-%m-%d")
        records, _ = _tr_read_file(
            f"03_JARVIS_Data/Link_Registry/{date_str}.json", token, vault_repo
        )
        for rec in records:
            if rec.get("tracking_id") == tracking_id:
                return rec
    return {}


def _tr_validate_url(url: str) -> bool:
    """
    Return True only if url points to an approved AliExpress affiliate domain.
    Prevents open-redirect vulnerability.
    """
    import urllib.parse as _up
    if not url:
        return False
    try:
        host = _up.urlparse(url).netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        return any(
            host == d or host.endswith("." + d)
            for d in _TRACKER_ALLOWED_DOMAINS
        )
    except Exception:
        return False


@app.route("/link-register", methods=["POST"])
def link_register():
    """
    Register a new GARVIS tracking link.
    Called by PELEG before publishing to Telegram.

    Body (JSON):
      tracking_id   — unique short ID (alphanumeric 6-24 chars)
      product_id    — AliExpress product ID
      product_name  — product display name
      keyword       — search keyword
      affiliate_url — raw AliExpress affiliate URL (validated to AliExpress domain)
      campaign_id   — optional campaign identifier
      source_agent  — caller identifier (default "PELEG")

    Returns: { ok, tracking_id, tracking_url }
    """
    token      = os.environ.get("GITHUB_TOKEN", "")
    vault_repo = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")
    garvis_base = os.environ.get("GARVIS_BASE_URL", "").rstrip("/")
    if not garvis_base:
        garvis_base = request.host_url.rstrip("/")

    if not token:
        return jsonify({"ok": False, "error": "server not configured"}), 503

    try:
        body = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"ok": False, "error": "invalid JSON"}), 400

    tracking_id   = (body.get("tracking_id") or "").strip()
    affiliate_url = (body.get("affiliate_url") or "").strip()
    product_id    = str(body.get("product_id") or "").strip()
    product_name  = str(body.get("product_name") or "")[:100]
    keyword       = str(body.get("keyword") or "")
    campaign_id   = str(body.get("campaign_id") or "")
    source_agent  = str(body.get("source_agent") or "PELEG")

    if not tracking_id or not re.match(r'^[a-zA-Z0-9_\-]{6,24}$', tracking_id):
        return jsonify({"ok": False, "error": "tracking_id required (6-24 alphanumeric)"}), 400
    if not affiliate_url or not _tr_validate_url(affiliate_url):
        return jsonify({"ok": False, "error": "invalid or disallowed affiliate_url"}), 400

    tracking_url = f"{garvis_base}/r/{tracking_id}"
    tz           = timezone(timedelta(hours=3))
    today        = datetime.now(tz).strftime("%Y-%m-%d")
    created_at   = datetime.now(tz).strftime("%Y-%m-%d %H:%M")
    path         = f"03_JARVIS_Data/Link_Registry/{today}.json"

    existing, sha = _tr_read_file(path, token, vault_repo)

    # Idempotency: don't duplicate same tracking_id
    for rec in existing:
        if rec.get("tracking_id") == tracking_id:
            return jsonify({
                "ok":          True,
                "tracking_id": tracking_id,
                "tracking_url": rec.get("tracking_url", tracking_url),
                "duplicate":   True,
            })

    record = {
        "tracking_id":   tracking_id,
        "product_id":    product_id,
        "product_name":  product_name,
        "keyword":       keyword,
        "affiliate_url": affiliate_url,
        "tracking_url":  tracking_url,
        "created_at":    created_at,
        "source":        "telegram",
        "campaign_id":   campaign_id,
        "status":        "active",
        "source_agent":  source_agent,
    }
    existing.append(record)
    ok = _tr_write_file(
        path, existing,
        f"[GARVIS] Register link: {tracking_id}",
        token, vault_repo, sha
    )
    if not ok:
        return jsonify({"ok": False, "error": "vault write failed"}), 502

    return jsonify({"ok": True, "tracking_id": tracking_id, "tracking_url": tracking_url})


@app.route("/r/<tracking_id>", methods=["GET"])
def tracker_redirect(tracking_id):
    """
    GARVIS Internal Tracker redirect.
    Looks up tracking_id → records click event in vault → 302 redirects.

    Security guarantees:
    - Only redirects to approved AliExpress affiliate domains (no open redirect).
    - Never stores raw IP addresses (SHA-256 16-char prefix only).
    - Returns safe 404 HTML for unknown or malformed tracking IDs.
    - Click recording is best-effort: vault failure does not block redirect.
    """
    import hashlib as _hh

    token      = os.environ.get("GITHUB_TOKEN", "")
    vault_repo = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")
    tz         = timezone(timedelta(hours=3))

    # Validate tracking_id format (alphanumeric, 6-24 chars)
    if not re.match(r'^[a-zA-Z0-9_\-]{6,24}$', tracking_id):
        return "<h1>404 Not Found</h1>", 404, {"Content-Type": "text/html"}

    # Lookup link record
    link = _tr_lookup_link(tracking_id, token, vault_repo, days=30)
    if not link:
        return "<h1>404 Not Found</h1>", 404, {"Content-Type": "text/html"}

    affiliate_url = link.get("affiliate_url", "")
    if not affiliate_url or not _tr_validate_url(affiliate_url):
        return "<h1>404 Not Found</h1>", 404, {"Content-Type": "text/html"}

    # Record click event (best-effort — redirect is NOT blocked on vault error)
    try:
        today   = datetime.now(tz).strftime("%Y-%m-%d")
        ts      = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
        ev_path = f"03_JARVIS_Data/Click_Events/{today}.json"
        events, sha = _tr_read_file(ev_path, token, vault_repo)

        # Privacy: hash IP — never store raw address
        raw_ip  = (request.headers.get("X-Forwarded-For") or request.remote_addr or "")
        ip_safe = raw_ip.split(",")[0].strip()
        ip_hash = _hh.sha256(ip_safe.encode()).hexdigest()[:16] if ip_safe else ""

        event = {
            "tracking_id":  tracking_id,
            "product_id":   link.get("product_id", ""),
            "keyword":      link.get("keyword", ""),
            "timestamp":    ts,
            "source":       "telegram",
            "user_agent":   (request.headers.get("User-Agent") or "")[:120],
            "ip_hash":      ip_hash,
            "referrer":     (request.referrer or "")[:200],
            "source_agent": "GARVIS",
        }
        events.append(event)
        _tr_write_file(
            ev_path, events,
            f"[GARVIS] Click: {tracking_id}",
            token, vault_repo, sha
        )
    except Exception as e:
        print(f"[Tracker] click record error (non-fatal): {e}")

    from flask import redirect as _redir
    return _redir(affiliate_url, code=302)


@app.route("/link-health", methods=["GET"])
def link_health():
    """
    Link_Registry health: link count today + last N days, grouped by source agent.
    Safe — no secrets or raw URLs returned.
    Query param: days (default 7, max 30)
    """
    token      = os.environ.get("GITHUB_TOKEN", "")
    vault_repo = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")
    tz         = timezone(timedelta(hours=3))
    days_back  = min(int(request.args.get("days", 7)), 30)
    today      = datetime.now(tz).strftime("%Y-%m-%d")

    total = 0; today_count = 0; by_agent: dict = {}; recent: list = []

    for i in range(days_back):
        date_str = (datetime.now(tz) - timedelta(days=i)).strftime("%Y-%m-%d")
        records, _ = _tr_read_file(
            f"03_JARVIS_Data/Link_Registry/{date_str}.json", token, vault_repo
        )
        total += len(records)
        if date_str == today:
            today_count = len(records)
            recent = [
                {
                    "tracking_id":  r.get("tracking_id"),
                    "product_name": (r.get("product_name") or "")[:50],
                    "created_at":   r.get("created_at"),
                    "status":       r.get("status"),
                }
                for r in records[-5:]
            ]
        for r in records:
            ag = r.get("source_agent", "unknown")
            by_agent[ag] = by_agent.get(ag, 0) + 1

    return jsonify({
        "ok":              True,
        "today":           today,
        "today_links":     today_count,
        "total_links":     total,
        "days_scanned":    days_back,
        "by_source_agent": by_agent,
        "recent":          recent,
    })


@app.route("/click-summary", methods=["GET"])
def click_summary():
    """
    Aggregated click counts from GARVIS Click_Events vault.
    Safe — no raw IPs, no secrets.
    Query param: days (default 7, max 30)
    """
    token      = os.environ.get("GITHUB_TOKEN", "")
    vault_repo = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")
    tz         = timezone(timedelta(hours=3))
    days_back  = min(int(request.args.get("days", 7)), 30)
    today      = datetime.now(tz).strftime("%Y-%m-%d")

    total_clicks = 0; today_clicks = 0

    for i in range(days_back):
        date_str = (datetime.now(tz) - timedelta(days=i)).strftime("%Y-%m-%d")
        events, _ = _tr_read_file(
            f"03_JARVIS_Data/Click_Events/{date_str}.json", token, vault_repo
        )
        n = len(events)
        total_clicks += n
        if date_str == today:
            today_clicks = n

    return jsonify({
        "ok":           True,
        "today":        today,
        "today_clicks": today_clicks,
        "total_clicks": total_clicks,
        "days_scanned": days_back,
    })


@app.route("/clicks-by-product", methods=["GET"])
def clicks_by_product():
    """
    Click counts grouped by product_id from GARVIS Click_Events.
    Returns top 20 products by total clicks.
    Query param: days (default 7, max 30)
    """
    token      = os.environ.get("GITHUB_TOKEN", "")
    vault_repo = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")
    tz         = timezone(timedelta(hours=3))
    days_back  = min(int(request.args.get("days", 7)), 30)
    counts: dict = {}

    for i in range(days_back):
        date_str = (datetime.now(tz) - timedelta(days=i)).strftime("%Y-%m-%d")
        events, _ = _tr_read_file(
            f"03_JARVIS_Data/Click_Events/{date_str}.json", token, vault_repo
        )
        for ev in events:
            pid = ev.get("product_id") or ev.get("tracking_id", "unknown")
            tid = ev.get("tracking_id", "")
            if pid not in counts:
                counts[pid] = {"product_id": pid, "tracking_id": tid, "clicks": 0}
            counts[pid]["clicks"] += 1

    top = sorted(counts.values(), key=lambda x: x["clicks"], reverse=True)
    return jsonify({"ok": True, "days": days_back, "products": top[:20]})


@app.route("/clicks-by-keyword", methods=["GET"])
def clicks_by_keyword():
    """
    Click counts grouped by keyword from GARVIS Click_Events.
    Returns keyword click distribution (top 20).
    Query param: days (default 7, max 30)
    """
    token      = os.environ.get("GITHUB_TOKEN", "")
    vault_repo = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")
    tz         = timezone(timedelta(hours=3))
    days_back  = min(int(request.args.get("days", 7)), 30)
    counts: dict = {}

    for i in range(days_back):
        date_str = (datetime.now(tz) - timedelta(days=i)).strftime("%Y-%m-%d")
        events, _ = _tr_read_file(
            f"03_JARVIS_Data/Click_Events/{date_str}.json", token, vault_repo
        )
        for ev in events:
            kw = (ev.get("keyword") or "unknown").strip().lower()
            counts[kw] = counts.get(kw, 0) + 1

    top = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    return jsonify({
        "ok":      True,
        "days":    days_back,
        "keywords": [{"keyword": kw, "clicks": cnt} for kw, cnt in top[:20]],
    })


# ═══════════════════════════════════════════════════════════════════════════════
# JARVIS CHAT — /api/jarvis/chat
# Real conversation endpoint for the JARVIS interface right panel.
# Uses the existing OpenAI brain when OPENAI_API_KEY is configured;
# otherwise falls back to an honest basic command router. Never exposes keys.
# ═══════════════════════════════════════════════════════════════════════════════

def _jarvis_basic_router(msg: str, base_url: str):
    """Keyword router used when full AI is unavailable. Returns (reply, mode)."""
    low = msg.lower()
    ds  = _ds_cache.get("data") or {}
    if not ds and any(k in low for k in ("status", "סטטוס", "מצב", "health", "בריאות")):
        return ("נתוני המערכת עדיין נטענים מה-Vault. פתח את הדשבורד או שאל שוב בעוד רגע:\n"
                f"{base_url}/dashboard", "basic_command_router")

    if any(k in low for k in ("status", "סטטוס", "מצב")):
        st = (ds.get("today_status") or {}).get("overall", "לא ידוע")
        return (
            f"סטטוס מערכת: {st}\n"
            f"פורסמו היום: {ds.get('published_today', '—')} · "
            f"קליקים: {ds.get('clicks_today', '—')} · "
            f"ריצה הבאה: {ds.get('next_run', '—')}\n"
            f"דשבורד מלא: {base_url}/dashboard",
            "basic_command_router")

    if any(k in low for k in ("dashboard", "דשבורד", "לוח")):
        return (f"דשבורד SPORTIVI: {base_url}/dashboard\n"
                f"דשבורד ישן (גיבוי): {base_url}/dashboard-old",
                "basic_command_router")

    if any(k in low for k in ("health", "בריאות")):
        ah = ds.get("agent_health") or {}
        ok_n   = sum(1 for v in ah.values() if v.get("status") == "ok")
        fail_n = sum(1 for v in ah.values() if v.get("status") == "fail")
        fails  = ", ".join(k for k, v in ah.items() if v.get("status") == "fail") or "אין"
        return (f"בריאות סוכנים: {ok_n} תקינים, {fail_n} בתקלה (מתוך {len(ah) or 9}).\n"
                f"בתקלה: {fails}\n"
                f"עדכון אחרון: {ds.get('last_updated', '—')}",
                "basic_command_router")

    if any(k in low for k in ("help", "עזרה", "פקודות")):
        return ("פקודות זמינות:\n"
                "• סטטוס / status — מצב המערכת היום\n"
                "• בריאות / health — מצב הסוכנים\n"
                "• דשבורד / dashboard — קישורים ללוחות הבקרה\n"
                "• עזרה / help — הרשימה הזו",
                "basic_command_router")

    return ("מצב שיחה בסיסי פעיל. חיבור AI מלא עדיין לא מוגדר בשרת.\n"
            "נסה: סטטוס · בריאות · דשבורד · עזרה",
            "fallback")


@app.route("/api/jarvis/chat", methods=["POST"])
def jarvis_chat():
    data = request.get_json(silent=True) or {}
    msg  = (data.get("message") or "").strip()
    il_tz = timezone(timedelta(hours=3))
    ts    = datetime.now(il_tz).strftime("%Y-%m-%d %H:%M:%S")

    if not msg:
        return jsonify({"ok": False, "reply": "לא התקבלה הודעה.",
                        "mode": "fallback", "timestamp": ts}), 400

    base_url = request.host_url.rstrip("/")

    # Full AI path — same brain as /command, without the debug header block
    if os.environ.get("OPENAI_API_KEY"):
        try:
            action_type = route_command(msg)
            reply = ask_openai_brain(msg, action_type)
            return jsonify({"ok": True, "reply": reply,
                            "mode": "real_ai", "timestamp": ts})
        except Exception as e:
            print(f"[JarvisChat] AI error, using basic router: {e}")

    reply, mode = _jarvis_basic_router(msg, base_url)
    return jsonify({"ok": True, "reply": reply, "mode": mode, "timestamp": ts})


# ═══════════════════════════════════════════════════════════════════════════════
# SPORTIVI DASHBOARD V2 — /api/vault/daily-summary
# One secure aggregated endpoint powering the approved SPORTIVI dashboard.
# All vault reads happen server-side with GITHUB_TOKEN — token never reaches
# the browser. Every source fails independently; missing files never crash.
# 15-minute in-memory cache keeps GitHub API usage low.
# ═══════════════════════════════════════════════════════════════════════════════

_ds_cache: dict = {}            # keys: data, expires_at
_DS_CACHE_TTL = 900             # 15 minutes

# jarvis_daily.yml cron slots (Israel time)
_DS_SLOTS = ["09:00", "09:52", "10:44", "11:36", "12:28", "13:20", "14:12",
             "15:04", "15:56", "16:48", "17:40", "18:32", "19:24", "20:16", "21:08"]


def _ds_next_run(now_il):
    hhmm = now_il.strftime("%H:%M")
    for slot in _DS_SLOTS:
        if slot > hhmm:
            return f"היום {slot}"
    return f"מחר {_DS_SLOTS[0]}"


@app.route("/api/vault/daily-summary", methods=["GET"])
def vault_daily_summary():
    import time as _time

    # ── Cache ─────────────────────────────────────────────────────────────────
    if (request.args.get("refresh") != "1"
            and _ds_cache.get("data")
            and _time.time() < _ds_cache.get("expires_at", 0)):
        return jsonify(_ds_cache["data"])

    token      = os.environ.get("GITHUB_TOKEN", "")
    vault_repo = os.environ.get("JARVIS_VAULT_REPO", "sportiviforyou-netizen/jarvis-vault")
    il_tz      = timezone(timedelta(hours=3))
    now_il     = datetime.now(il_tz)
    today      = now_il.strftime("%Y-%m-%d")

    if not token:
        return jsonify({
            "ok": False,
            "error": "GITHUB_TOKEN not configured on server",
            "last_updated": now_il.strftime("%Y-%m-%d %H:%M:%S"),
            "data_quality": {"all": "missing"},
        }), 503

    quality: dict = {}   # field → real | fallback | missing | stale

    # ── 1. Published_Index (today) ───────────────────────────────────────────
    published_records, _ = _tr_read_file(
        f"03_JARVIS_Data/Published_Index/{today}.json", token, vault_repo)
    published_today = len(published_records)
    short_links     = sum(1 for r in published_records if r.get("tracking_id"))
    quality["published_today"] = "real"

    products_today = [{
        "name":         r.get("product_name", r.get("title", "—")),
        "keyword":      r.get("keyword", ""),
        "publish_time": r.get("publish_time", ""),
        "channel":      r.get("channel", "telegram"),
        "tracking_id":  r.get("tracking_id", ""),
    } for r in published_records]

    # Average score — only if PELEG stored a score on the records
    _scores = [r.get("score") for r in published_records
               if isinstance(r.get("score"), (int, float))]
    if _scores:
        average_score = round(sum(_scores) / len(_scores), 1)
        quality["average_score"] = "real"
    else:
        average_score = None
        quality["average_score"] = "missing"

    # ── 2. Click_Events (7-day trend) ────────────────────────────────────────
    clicks_today = 0
    click_trend  = []
    for i in range(6, -1, -1):
        d = (now_il - timedelta(days=i)).strftime("%Y-%m-%d")
        events, _ = _tr_read_file(
            f"03_JARVIS_Data/Click_Events/{d}.json", token, vault_repo)
        click_trend.append({"date": d, "clicks": len(events)})
        if d == today:
            clicks_today = len(events)
    quality["clicks_today"] = "real"
    quality["click_trend_7_days"] = "real"

    # ── 3. Scheduled_Agents_Health (ROMI/AGAM/OLIVE/INTEL) ───────────────────
    sched: dict = {}
    raw, err = _vault_get(
        f"03_JARVIS_Data/Scheduled_Agents_Health/{today}.json", token, vault_repo)
    if raw and not err:
        sched = _decode_b64(raw) or {}
        quality["scheduled_agents"] = "real"
    else:
        # fall back to yesterday — mark stale
        y = (now_il - timedelta(days=1)).strftime("%Y-%m-%d")
        raw, err = _vault_get(
            f"03_JARVIS_Data/Scheduled_Agents_Health/{y}.json", token, vault_repo)
        if raw and not err:
            sched = _decode_b64(raw) or {}
            quality["scheduled_agents"] = "stale"
        else:
            quality["scheduled_agents"] = "missing"

    # ── 4. Pipeline_Health — latest run (today, else yesterday=stale) ────────
    last_run: dict = {}
    pipeline_quality = "missing"
    for i in range(2):
        d = (now_il - timedelta(days=i)).strftime("%Y-%m-%d")
        listing, lerr = _vault_get(
            f"03_JARVIS_Data/Pipeline_Health/{d}", token, vault_repo)
        if not isinstance(listing, list) or lerr:
            continue
        files = sorted((f for f in listing if f.get("name", "").endswith(".json")),
                       key=lambda x: x.get("name", ""), reverse=True)
        if not files:
            continue
        rec, rerr = _vault_get(files[0]["path"], token, vault_repo)
        if rec and not rerr:
            obj = _decode_b64(rec)
            if isinstance(obj, dict):
                last_run = obj
                pipeline_quality = "real" if i == 0 else "stale"
                break
    quality["pipeline"] = pipeline_quality

    # ── 5. Intel_Cache — SARIT intelligence (today, else up to 3 days=stale) ─
    intel: dict = {}
    intel_quality = "missing"
    for i in range(3):
        d = (now_il - timedelta(days=i)).strftime("%Y-%m-%d")
        raw, err = _vault_get(
            f"03_JARVIS_Data/Intel_Cache/{d}.json", token, vault_repo)
        if raw and not err:
            data = _decode_b64(raw)
            if isinstance(data, dict):
                intel = data
                intel_quality = "real" if i == 0 else "stale"
                break
    quality["intel"] = intel_quality
    synthesis = intel.get("synthesis", {}) if intel else {}

    scanned_opportunities = (intel.get("stats", {}).get("opportunity_keywords")
                             or len(intel.get("opportunity_scores", []))
                             or None)
    quality["scanned_opportunities"] = intel_quality if scanned_opportunities else "missing"

    # ── 6. Social_Drafts (today) ─────────────────────────────────────────────
    drafts, _ = _tr_read_file(
        f"03_JARVIS_Data/Social_Drafts/{today}.json", token, vault_repo)

    def _platform_block(platform):
        items = [d for d in drafts if d.get("platform") == platform]
        published = [d for d in items if d.get("approval_status") == "published"]
        if published:
            return {"published": len(published), "status": "פורסם",
                    "items": [d.get("caption", "")[:80] for d in published[:3]]}
        if items:
            return {"published": 0, "drafts": len(items),
                    "status": "טיוטה ממתינה לאישור",
                    "items": [d.get("caption", "")[:80] for d in items[:3]]}
        return {"published": 0, "status": "אין פעילות היום", "items": []}

    social_media = {
        "telegram": {
            "published": published_today,
            "status":    "פורסם" if published_today else "אין פרסומים עדיין היום",
            "channel":   "t.me/sportiviforyou",
            "items":     [p["name"][:80] for p in products_today[:5]],
        },
        "facebook":  _platform_block("facebook"),
        "instagram": _platform_block("instagram"),
        "tiktok":    _platform_block("tiktok"),
    }
    quality["social_media"] = "real"

    # ── 7. Orders + commission — ae-analytics cache, else ROMI detail ────────
    orders = None
    commission = None
    if _ae_cache.get("data") and _time.time() < _ae_cache.get("expires_at", 0):
        ae = _ae_cache["data"].get("data", {})
        orders     = ae.get("orders_month")
        commission = ae.get("commission_estimated")
        quality["orders"] = quality["estimated_commission"] = "real"
    else:
        romi_detail = (sched.get("ROMI") or {}).get("detail", "")
        m = re.search(r"(\d+)\s*הזמנות\s*\|\s*\$([\d.]+)\s*עמלה", romi_detail)
        if m:
            orders     = int(m.group(1))
            commission = float(m.group(2))
            quality["orders"] = quality["estimated_commission"] = "fallback"
        else:
            quality["orders"] = quality["estimated_commission"] = "missing"

    # ── 8. Agent health — 9 agents (Hebrew keys, approved order) ─────────────
    stages = last_run.get("stages", {}) if last_run else {}

    def _stage(name):
        s = stages.get(name)
        if not s:
            return {"status": "unknown", "detail": "אין נתוני ריצה", "ts": ""}
        return {"status": "ok" if s.get("status") == "ok" else "fail",
                "detail": s.get("detail", ""), "ts": s.get("ts", "")}

    def _sched_agent(name):
        s = sched.get(name)
        if not s:
            return {"status": "unknown", "detail": "אין דיווח היום", "ts": ""}
        return {"status": "ok" if s.get("status") == "ok" else "fail",
                "detail": s.get("detail", ""), "ts": s.get("ts", "")}

    agent_health = {
        "שרית":  _sched_agent("INTEL"),
        "טליה":  _stage("TALIA"),
        "גל":    _stage("GAL"),
        "שיר":   _stage("SHIR"),
        "פלג":   _stage("PELEG"),
        "רומי":  _sched_agent("ROMI"),
        "אגם":   _sched_agent("AGAM"),
        "אוליב": _sched_agent("OLIVE"),
        "אנדי":  _stage("ANDY"),
    }
    quality["agent_health"] = ("real" if (pipeline_quality == "real"
                               or quality["scheduled_agents"] == "real") else
                               "stale" if (pipeline_quality == "stale"
                               or quality["scheduled_agents"] == "stale") else "missing")

    # ── 9. Faults + alerts ────────────────────────────────────────────────────
    faults = []
    if last_run.get("status") == "failed":
        faults.append({
            "source": "Pipeline",
            "msg":    last_run.get("failure_reason", "ריצה אחרונה נכשלה"),
            "ts":     last_run.get("run_at", ""),
        })
    for e in (last_run.get("errors") or [])[:5]:
        faults.append({"source": e.get("source", "?"),
                       "msg": e.get("msg", ""), "ts": e.get("ts", "")})
    agam = sched.get("AGAM") or {}
    if agam.get("status") == "fail":
        faults.append({"source": "AGAM",
                       "msg": agam.get("detail", "בדיקת מערכת נכשלה"),
                       "ts": agam.get("ts", "")})

    system_alerts = [f"{f['source']}: {f['msg']}" for f in faults]
    pending_drafts = sum(1 for d in drafts if d.get("approval_status") == "pending")
    if pending_drafts:
        system_alerts.append(
            f"סושיאל: {pending_drafts} טיוטות ממתינות לאישור (פייסבוק/אינסטגרם/טיקטוק)")
    if intel_quality == "stale":
        system_alerts.append("שרית: נתוני מודיעין מאתמול — ריצת INTEL של היום טרם הסתיימה")

    # ── 10. Today status (תקין / לא תקין) ────────────────────────────────────
    agam_detail = agam.get("detail", "")
    checks = {
        "פרסומים":  published_today > 0,
        "Pipeline": last_run.get("status") in ("success", "window_block") if last_run else False,
        "סוכנים":   all(a["status"] != "fail" for a in agent_health.values()),
        "AGAM":     agam.get("status", "") != "fail",
    }
    overall_ok = checks["פרסומים"] and checks["Pipeline"] and checks["AGAM"]
    today_status = {
        "overall": "תקין" if overall_ok else "לא תקין",
        "checks":  {k: ("תקין" if v else "לא תקין") for k, v in checks.items()},
        "detail":  agam_detail,
    }

    # ── 11. SARIT panels (from INTEL until a real SARIT agent exists) ────────
    sarit_weekly = {
        "summary":   synthesis.get("summary", ""),
        "source":    "INTEL (Intel_Cache)",
        "generated": intel.get("generated_at", ""),
    } if synthesis else None
    quality["sarit_weekly_improvement"] = intel_quality if synthesis else "missing"

    top_opps = [{
        "keyword":     s.get("keyword", ""),
        "opportunity": s.get("opportunity_v3", s.get("opportunity", 0)),
        "label":       s.get("label", ""),
    } for s in (intel.get("opportunity_scores") or [])[:5]]
    sarit_recommendations = {
        "recommended_focus": synthesis.get("recommended_focus", ""),
        "hot_categories":    synthesis.get("hot_categories", []),
        "top_opportunities": top_opps,
    } if synthesis else None
    quality["sarit_upgrade_recommendations"] = intel_quality if synthesis else "missing"

    # ── 12. Recommended actions ──────────────────────────────────────────────
    actions = []
    if not checks["Pipeline"]:
        actions.append("בדוק את הריצה האחרונה ב-GitHub Actions — ה-Pipeline נכשל")
    if published_today == 0 and now_il.strftime("%H:%M") > _DS_SLOTS[0]:
        actions.append("טרם פורסמו מוצרים היום — ודא שהריצות פעילות")
    if pending_drafts:
        actions.append(f"אשר {pending_drafts} טיוטות סושיאל הממתינות לפרסום")
    if synthesis.get("recommended_focus"):
        actions.append(f"מיקוד מומלץ היום: {synthesis['recommended_focus']}")
    if not actions:
        actions.append("הכל תקין — אין פעולות נדרשות כרגע")

    # ── Assemble ─────────────────────────────────────────────────────────────
    payload = {
        "ok":                           True,
        "published_today":              published_today,
        "clicks_today":                 clicks_today,
        "orders":                       orders,
        "estimated_commission":         commission,
        "average_score":                average_score,
        "scanned_opportunities":        scanned_opportunities,
        "short_links_created":          short_links,
        "next_run":                     _ds_next_run(now_il),
        "social_media":                 social_media,
        "today_status":                 today_status,
        "faults":                       faults,
        "published_products_today":     products_today,
        "click_trend_7_days":           click_trend,
        "agent_health":                 agent_health,
        "sarit_weekly_improvement":     sarit_weekly,
        "sarit_upgrade_recommendations": sarit_recommendations,
        "system_alerts":                system_alerts,
        "recommended_actions":          actions,
        "last_updated":                 now_il.strftime("%Y-%m-%d %H:%M:%S"),
        "data_quality":                 quality,
    }

    _ds_cache["data"]       = payload
    _ds_cache["expires_at"] = _time.time() + _DS_CACHE_TTL
    return jsonify(payload)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
