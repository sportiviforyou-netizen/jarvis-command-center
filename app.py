import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from openai import OpenAI

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
CORS(app)

client = OpenAI()


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


def ask_openai_brain(command: str):
    model = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")

    system_prompt = """
אתה ג׳רביס, סוכן AI פרטי של מוטי.

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
                "content": command
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

    try:
        ai_reply = ask_openai_brain(command)

        reply = f"""
גרסת מוח: 2.0
מוח פעיל: OpenAI

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
