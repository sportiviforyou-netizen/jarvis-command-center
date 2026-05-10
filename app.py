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

    wants_approval = any(phrase in text for phrase in [
        "תאשר איתי",
        "לאשר איתי",
        "לפני ביצוע",
        "לפני שאתה מבצע",
        "תשאל אותי לפני",
        "רק אחרי אישור",
        "באישור שלי"
    ])

    if requires_code:
        task_type = "פיתוח מערכת / קוד"
        agent = "Codex"
        reason = "המשימה כוללת פעולה טכנית, קוד, שרת, דשבורד או חיבור מערכת."
    elif requires_design:
        task_type = "עיצוב ויזואלי"
        agent = "Canva"
        reason = "המשימה כוללת יצירת נכס ויזואלי, עיצוב או מסך."
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
        reason = "המשימה דורשת הבנה, ניתוח ותכנון פעולה."

    complexity = "נמוכה"
    if len(command) > 160:
        complexity = "בינונית"
    if len(command) > 350:
        complexity = "גבוהה"

    return {
        "task_type": task_type,
        "agent": agent,
        "reason": reason,
        "complexity": complexity,
        "wants_approval": wants_approval
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

    approval_text = "לא נדרש אישור נוסף. מבצע לפי הפקודה."    
    next_step = "לבצע את הפעולה לפי סוג המשימה."

    if analysis["wants_approval"]:
        approval_text = "נדרש אישור ממך לפני ביצוע, כי ביקשת שאאשר איתך."
        next_step = "להציג לך תוכנית פעולה קצרה לאישור לפני ביצוע."

    reply = f"""
גרסת מוח: 1.1

פקודה התקבלה.

מה ביקשת:
{command}

סוג המשימה:
{analysis['task_type']}

רמת מורכבות:
{analysis['complexity']}

הסוכן המתאים:
{analysis['agent']}

למה:
{analysis['reason']}

אישור:
{approval_text}

תוכנית פעולה:
1. להבין את מטרת הפקודה.
2. לבחור לבד את הסוכן או דרך הביצוע המתאימה.
3. לבצע או להכין תוצר לפי הבקשה.
4. אם ביקשת אישור מראש, לעצור ולהציג לך לאישור.
5. להחזיר לך תשובה קצרה וברורה.

השלב הבא:
{next_step}
"""

    return jsonify({
        "status": "success",
        "reply": reply,
        "next_step": next_step
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)