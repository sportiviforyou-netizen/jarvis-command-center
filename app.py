import os
import re
from datetime import datetime
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
        sched = BackgroundScheduler(timezone="UTC")
        # 15 daily runs: 09:00–21:08 Israel (UTC+3) = 06:00–18:08 UTC
        times = [
            (6,0),(6,52),(7,44),(8,36),(9,28),
            (10,20),(11,12),(12,4),(12,56),(13,48),
            (14,40),(15,32),(16,24),(17,16),(18,8),
        ]
        for h, m in times:
            sched.add_job(
                _trigger_affiliate_job,
                CronTrigger(hour=h, minute=m, timezone="UTC"),
                id=f"affiliate_{h}_{m}",
                replace_existing=True,
            )
        sched.start()
        print(f"[Scheduler] Started — {len(times)} daily jobs loaded")
    except Exception as e:
        print(f"[Scheduler] Failed to start: {e}")

# Start only once (not in Flask reloader child process)
if not os.environ.get("WERKZEUG_RUN_MAIN"):
    _start_scheduler()
# ────────────────────────────────────────────────────────────────

client = OpenAI()

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
    if not os.path.isdir(MEMORY_DIR):
        return ""

    sections = []
    total_chars = 0

    for filename in MEMORY_FILES:
        path = os.path.join(MEMORY_DIR, filename)
        if not os.path.isfile(path):
            continue

        try:
            with open(path, "r", encoding="utf-8") as file:
                content = file.read().strip()
        except OSError:
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

    with open(path, "a", encoding="utf-8") as file:
        file.write(f"\n- {timestamp}: {memory_text}\n")


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

        path = os.path.join(MEMORY_DIR, filename)
        if not os.path.isfile(path):
            sections.append(f"memory/{filename}\nאין מידע שמור.")
            continue

        try:
            with open(path, "r", encoding="utf-8") as file:
                content = file.read().strip()
        except OSError:
            content = ""

        if not content:
            content = "אין מידע שמור."
        elif looks_like_secret(content):
            content = "[הקובץ לא מוצג כי הוא נראה כאילו הוא מכיל מידע רגיש או סודי.]"

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


def should_use_web_search(command: str, action_type: str) -> bool:
    return action_type == "web_search_needed"


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
            "name": "Finder",
            "icon": "🔍",
            "role": "איתור מוצרים",
            "description": "מחפש מוצרי ספורט ב-AliExpress API — 3 קטגוריות אקראיות, ממוין לפי נמכר ביותר, מסנן לפי דירוג ≥ 3.5 ומחיר $3–$60",
            "status": "active",
        },
        {
            "id": 2,
            "name": "Filter",
            "icon": "🔬",
            "role": "דירוג עם AI",
            "description": "שולח כל מוצר ל-Claude AI לניתוח. מציון 0–100 — אחרי ציון 45 ומלצת publish המוצר עובר לשלב הבא",
            "status": "active",
        },
        {
            "id": 3,
            "name": "Content",
            "icon": "✍️",
            "role": "יצירת תוכן",
            "description": "כותב עם Claude פוסט שיווקי בעברית לכל מוצר שאושר — כותרת, תיאור, 3 יתרונות, מחיר וקריאה לפעולה",
            "status": "active",
        },
        {
            "id": 4,
            "name": "Publisher",
            "icon": "📢",
            "role": "פרסום לטלגרם",
            "description": "שולח את הפוסט עם תמונת המוצר לערוץ SPORTIVI FOR YOU בטלגרם דרך Bot API",
            "status": "active",
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
        "price_range": "$3–$60",
        "min_rating": "3.5★",
        "keywords_per_run": 3,
        "sort": "LAST_VOLUME_DESC",
        "platform": "GitHub Actions",
        "channel": "SPORTIVI FOR YOU",
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


@app.route("/sportivi", methods=["GET"])
def sportivi():
    return send_from_directory(BASE_DIR, "sportivi.html")


@app.route("/dashboard", methods=["GET"])
def dashboard():
    return send_from_directory(BASE_DIR, "dashboard.html")


@app.route("/", methods=["GET"])
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(BASE_DIR, filename)


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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
