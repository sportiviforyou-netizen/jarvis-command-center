import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
CORS(app)


def analyze_command(command: str):
    text = command.lower()

    requires_code = any(word in text for word in [
        "קוד", "פייתון", "python", "html", "css", "javascript", "api",
        "דשבורד", "אתר", "אפליקציה", "שרת", "באג", "תקלה", "רנדר", "github"
    ])

    requires_writing = any(word in text for word in [
        "ניסוח", "מייל", "מסמך", "סיכום", "מכתב", "תגובה", "נייר", "דוח"
    ])

    requires_marketing = any(word in text for word in [
        "שיווק", "פוסט", "מודעה", "טיקטוק", "ויראלי", "מכירה", "קמפיין"
    ])

    requires_design = any(word in text for word in [
        "תמונה", "עיצוב", "לוגו", "מצגת", "קנבה", "פוסטר", "ויזואל"
    ])

    if requires_code:
        task_type = "פיתוח מערכת / קוד"
        agent = "Codex"
        reason = "המשימה כוללת בנייה טכנית, קוד, שרת, דשבורד או חיבור מערכת."
    elif requires_design:
        task_type = "עיצוב ויזואלי"
        agent = "Canva"
        reason = "המשימה כוללת יצירת נכס ויזואלי או עיצוב."
    elif requires_marketing:
        task_type = "שיווק / תוכן"
        agent = "ChatGPT או Grok"
        reason = "המשימה דורשת מסר שיווקי, פוסט, רעיון ויראלי או קופי."
    elif requires_writing:
        task_type = "כתיבה / מסמך"
        agent = "Claude או ChatGPT"
        reason = "המשימה דורשת ניסוח, סיכום, כתיבה מקצועית או עריכת טקסט."
    else:
        task_type = "משימה כללית"
        agent = "ChatGPT"
        reason = "המשימה דורשת ניתוח כללי ותכנון פעולה."

    complexity = "נמוכה"
    if len(command) > 160:
        complexity = "בינונית"
    if len(command) > 350:
        complexity = "גבוהה"

    return {
        "task_type": task_type,
        "agent": agent,
        "reason": reason,
        "complexity": complexity
    }


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
            "reply": "לא התקבלה פקודה."
        }), 400

    analysis = analyze_command(command)

    reply = f"""
גרסת מוח: 1.0

פקודה התקבלה.

מה הבנתי:
{command}

סוג המשימה:
{analysis['task_type']}

רמת מורכבות:
{analysis['complexity']}

הסוכן המתאים:
{analysis['agent']}

למה:
{analysis['reason']}

תוכנית פעולה:
1. לדייק את מטרת המשימה והתוצר הסופי.
2. לפרק את המשימה לשלבי ביצוע ברורים.
3. לבחור את הסוכן המתאים לביצוע.
4. להכין פקודת ביצוע מסודרת.
5. להציג לך תוצר לאישור לפני פעולה רגישה.

נדרש אישור:
כן, לפני פרסום, שליחה, רכישה, מחיקה או שינוי מערכת פעילה.
"""

    return jsonify({
        "status": "success",
        "reply": reply,
        "next_step": "לאשר את תוכנית הפעולה או לבקש שינוי."
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)