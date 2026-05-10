import os
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route("/", methods=["GET"])
def home():
    return """
    <h1>Garvis Command Center</h1>
    <p>Garvis server is live.</p>
    <p>Use POST /command to send commands.</p>
    """

@app.route("/command", methods=["POST"])
def handle_command():
    data = request.get_json(silent=True) or {}
    command = data.get("command", "")

    if not command:
        return jsonify({
            "status": "error",
            "reply": "No command received."
        }), 400

    return jsonify({
        "status": "success",
        "reply": f"Garvis received your command: {command}",
        "next_step": "Command analysis will be added in the next version."
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)