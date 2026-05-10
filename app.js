const commandEl = document.getElementById("command");
const modeEl = document.getElementById("mode");
const agentEl = document.getElementById("agent");
const approvalEl = document.getElementById("approval");
const sendBtn = document.getElementById("sendBtn");
const resultCard = document.getElementById("resultCard");
const resultEl = document.getElementById("result");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");
const promptBtn = document.getElementById("promptBtn");

function detectIntent(text) {
  const t = text.toLowerCase();

  if (/(קוד|באג|api|דשבורד|אפליקציה|אתר|html|css|fastapi|python|שרת)/i.test(t)) {
    return {
      intent: "פיתוח מערכת / קוד",
      executor: "Codex",
      reason: "המשימה כוללת בנייה טכנית, קוד, דשבורד או חיבורי מערכת."
    };
  }

  if (/(מסמך|נייר|מייל|ניסוח|סיכום|מכתב|בקרה|תגובה|עבודה)/i.test(t)) {
    return {
      intent: "כתיבה וניתוח מסמכים",
      executor: "Claude או ChatGPT",
      reason: "המשימה כוללת ניסוח, סיכום, חשיבה מסודרת או כתיבה מקצועית."
    };
  }

  if (/(טיקטוק|ויראלי|טרנד|רשת|פוסט|שיווק|מודעה|פרסום)/i.test(t)) {
    return {
      intent: "שיווק / תוכן / רשתות",
      executor: "ChatGPT או Grok",
      reason: "המשימה דורשת רעיון חד, קופי שיווקי או התאמה לשיח ברשת."
    };
  }

  if (/(תמונה|עיצוב|מצגת|קנבה|לוגו|פוסטר|ויזואל)/i.test(t)) {
    return {
      intent: "עיצוב ויזואלי",
      executor: "Canva",
      reason: "המשימה דורשת תוצר ויזואלי, עיצוב או בניית נכס גרפי."
    };
  }

  return {
    intent: "משימה כללית",
    executor: "ChatGPT",
    reason: "המשימה דורשת ניתוח, תכנון ותשובה מסודרת."
  };
}

function complexity(text) {
  const len = text.trim().length;
  const signs = ["וגם", "בנוסף", "שלבים", "מערכת", "אוטומציה", "סוכנים", "חיבור", "api", "דשבורד"];
  const score = signs.filter(s => text.toLowerCase().includes(s)).length;

  if (len > 220 || score >= 3) return "גבוהה";
  if (len > 90 || score >= 1) return "בינונית";
  return "נמוכה";
}

function buildResponse(makePrompt = false) {
  const command = commandEl.value.trim();
  if (!command) {
    alert("כתוב פקודה לג׳רביס לפני השליחה.");
    return;
  }

  const detected = detectIntent(command);
  const selectedAgent = agentEl.value === "ג׳רביס יחליט" ? detected.executor : agentEl.value;
  const level = complexity(command);

  let response = `פקודה התקבלה.

מה הבנתי:
${command}

סוג המשימה:
${detected.intent}

רמת מורכבות:
${level}

הסוכן המתאים:
${selectedAgent}

למה:
${detedReason(detected, agentEl.value)}

מצב עבודה:
${modeEl.value}

רמת אישור:
${approvalEl.value}

תוכנית פעולה:
1. לדייק את מטרת המשימה והתוצר הסופי.
2. לפרק את המשימה לתת־משימות קצרות וברורות.
3. לבחור את הסוכן המתאים לכל חלק.
4. להכין פקודת ביצוע מסודרת.
5. להציג לך תוצר לאישור לפני פעולה רגישה.

נדרש אישור:
כן, לפני פרסום, שליחה, רכישה, מחיקה או שינוי מערכת פעילה.

הצעד הבא:
${modeEl.value === "הכנת פרומפט" || makePrompt ? "להכין פרומפט מדויק לסוכן שנבחר." : "לאשר את תוכנית הפעולה או לבקש שינוי."}`;

  if (makePrompt) {
    response += `

פרומפט מוצע לסוכן:
You are ${selectedAgent}, working under Garvis Commander for Moti.
Your task is to execute the following request clearly, professionally, and practically.

User request:
"${command}"

Work mode:
${modeEl.value}

Requirements:
- Start by confirming what you understood.
- Break the task into clear steps.
- Produce a practical output, not a generic explanation.
- If anything is risky, requires publishing, sending, deleting, buying, or changing a live system, stop and ask for approval.
- Prefer Hebrew output unless the task requires English.
- Keep the result structured and easy to act on.`;
  }

  resultEl.textContent = response;
  resultCard.classList.remove("hidden");
  resultCard.scrollIntoView({ behavior: "smooth", block: "start" });

  localStorage.setItem("garvis_last_command", command);
  localStorage.setItem("garvis_last_response", response);
}

function detedReason(detected, selected) {
  if (selected === "ג׳רביס יחליט") return detected.reason;
  return `בחרת ידנית את ${selected}. ג׳רביס ישמור את הבחירה שלך ויכין עבורה פקודת ביצוע מתאימה.`;
}

sendBtn.addEventListener("click", () => buildResponse(false));
promptBtn.addEventListener("click", () => buildResponse(true));

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
