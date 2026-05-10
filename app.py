import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from openai import OpenAI

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
CORS(app)

client = OpenAI()

BRAIN_VERSION = "2.2"
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
    "api_key",
    "apikey",
    "secret",
    "token",
    "password",
    "passwd",
    "private key",
    "credit card",
    "כרטיס אשראי",
    "סיסמה",
    "טוקן",
    "מפתח api",
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
    return has_any(lowered, SECRET_MARKERS)


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


def ask_openai_brain(command: str, action_type: str):
    model = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
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

    response = client.responses.create(
        model=model,
        input=[
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": f"{memory_prompt}\n\nDetected action type: {action_type}\n\nCommand:\n{command}"
            }
        ]
    )

    return response.output_text


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

    try:
        ai_reply = ask_openai_brain(command, action_type)

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
            "next_step": "הפקודה טופלה על ידי מוח OpenAI.",
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
