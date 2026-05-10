import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)

@app.route("/", methods=["GET"])
def home():
    return send_from_directory(".", "index.html")

@app.route("/style.css", methods=["GET"])
def style():
    return send_from_directory(".", "style.css")

@app.route("/app.js", methods=["GET"])
def javascript():
    return send_from_directory(".", "app.js")

@app.route("/manifest.json", methods=["GET"])
def manifest():
    return send_from_directory(".", "manifest.json")

@app.route("/command", methods=["POST"])
def handle_command():
    data = request.get_json(silent=True) or {}
    command = data.get("command", "")

    if not command:
        return jsonify({
            "status": "error",
            "reply": "לא התקבלה פקודה."
        }), 400

    return jsonify({
        "status": "success",
        "reply": f"ג׳רביס קיבל את הפקודה: {command}",
        "next_step": "בשלב הבא ג׳רביס ינתח את הפקודה ויחליט לאיזה סוכן להעביר אותה."
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
