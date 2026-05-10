const commandEl = document.getElementById("command");
const sendBtn = document.getElementById("sendBtn");
const resultCard = document.getElementById("resultCard");
const resultEl = document.getElementById("result");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");

const GARVIS_API_URL = "https://jarvis-command-center-1-0.onrender.com/command";

async function sendCommandToGarvis() {
  const command = commandEl.value.trim();

  if (!command) {
    alert("כתוב פקודה לג׳רביס לפני השליחה.");
    return;
  }

  resultCard.classList.remove("hidden");
  resultEl.textContent = "ג׳רביס מקבל את הפקודה ומעבד אותה...";

  try {
    const response = await fetch(GARVIS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        command: command
      })
    });

    const data = await response.json();

    if (!response.ok) {
      resultEl.textContent = data.reply || "אירעה שגיאה בשליחת הפקודה לג׳רביס.";
      return;
    }

    resultEl.textContent = data.reply;

    localStorage.setItem("garvis_last_command", command);
    localStorage.setItem("garvis_last_response", data.reply);

  } catch (error) {
    resultEl.textContent = `
שגיאה בחיבור לשרת ג׳רביס.

מה לבדוק:
1. שהשרת ב-Render פעיל.
2. שהכתובת נכונה.
3. שהאינטרנט עובד.
4. שהשרת לא במצב שינה ומתעורר.

פירוט טכני:
${error.message}
`;
  }

  resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

sendBtn.addEventListener("click", sendCommandToGarvis);

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultEl.textContent);
    copyBtn.textContent = "הועתק";
    setTimeout(() => copyBtn.textContent = "העתק", 1200);
  } catch {
    alert("לא הצלחתי להעתיק אוטומטית. אפשר לסמן ולהעתיק ידנית.");
  }
});

clearBtn.addEventListener("click", () => {
  commandEl.value = "";
  resultEl.textContent = "";
  resultCard.classList.add("hidden");
});

window.addEventListener("load", () => {
  const last = localStorage.getItem("garvis_last_command");
  if (last) commandEl.value = last;
});