document.addEventListener("DOMContentLoaded", () => {
  const authForm = document.getElementById("authForm");
  
  if (authForm) {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const usernameInput = document.getElementById("username");
      const passwordInput = document.getElementById("password");

      if (!usernameInput || !passwordInput) return;

      const username = usernameInput.value;
      const password = passwordInput.value;

      try {
        const response = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          localStorage.setItem("userId", data.userId);
          localStorage.setItem("role", data.role);

          if (data.role === "admin") {
            window.location.href = "admin-dashboard.html";
          } else {
            window.location.href = "student-dashboard.html";
          }
        } else {
          alert(data.message || "Login failed. Check your credentials.");
        }
      } catch (err) {
        console.error("Auth error:", err);
        alert("Failed to connect to the server.");
      }
    });
  }
});

let isExamActive = false; 
let proctoringEnabledTime = 0;

function startExamProctoring() {
  isExamActive = false;
  proctoringEnabledTime = Date.now() + 2000;
  
  setTimeout(() => {
    isExamActive = true;
    console.log("Proctoring active: Monitoring mobile app switches and tab changes...");
  }, 2000);
}

async function triggerProctoringViolation() {
  if (!isExamActive || Date.now() < proctoringEnabledTime) return;
  const userId = localStorage.getItem("userId");
  if (!userId) return;

  try {
    const response = await fetch('/api/exam/strike', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });

    const data = await response.json();

    if (data.success) {
      if (data.terminated) {
        alert(data.message);
        isExamActive = false;
        if (typeof submitActiveExam === 'function') {
          submitActiveExam();
        } else {
          window.location.href = "student-dashboard.html";
        }
      } else {
        alert(data.message);
      }
    }
  } catch (err) {
    console.error("Error reporting proctoring strike:", err);
  }
}

document.addEventListener("visibilitychange", () => {
  if (isExamActive && document.hidden) {
    triggerProctoringViolation();
  }
});

window.addEventListener("blur", () => {
  if (isExamActive) {
    triggerProctoringViolation();
  }
});

async function resetStudentExam(studentId, testId) {
  try {
    const response = await fetch("/api/admin/reset-exam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, testId })
    });

    const data = await response.json();
    alert(data.message);
    if (typeof loadAdminData === 'function') {
      loadAdminData();
    }
  } catch (err) {
    console.error("Error resetting student exam:", err);
  }
}

// --- NEW FUNCTIONS TO FIX EXAM LOADING ---

let currentActiveTest = null;
let studentAnswers = {};
let examTimerInterval = null;
let examTimeRemaining = 0;

async function loadTestExam(testId) {
  try {
    const res = await fetch(`/api/tests/${testId}`);
    const data = await res.json();
    
    if (!data.success) {
      alert(data.message || "Could not load test details.");
      return;
    }

    currentActiveTest = data.test;
    studentAnswers = {};
    renderExamInterface(data.test);
  } catch (err) {
    console.error("Error loading test details:", err);
    alert("Could not load test details due to a connection error.");
  }
}

function renderExamInterface(test) {
  let mainContainer = document.querySelector(".container") || document.body;
  
  let questionsHTML = test.questions.map((q, idx) => {
    let optionsHTML = q.options.map(opt => `
      <label style="display:block; margin:8px 0; cursor:pointer; background:rgba(255,255,255,0.05); padding:10px; border-radius:6px;">
        <input type="radio" name="question_${idx}" value="${opt}" onclick="studentAnswers[${idx}] = '${opt.replace(/'/g, "\\'")}'" style="margin-right:10px;">
        ${opt}
      </label>
    `).join('');

    return `
      <div style="margin-bottom:20px; background:rgba(15,23,42,0.6); padding:15px; border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
        <p><strong>Q${idx + 1}: ${q.questionText}</strong></p>
        ${optionsHTML}
      </div>
    `;
  }).join('');

  mainContainer.innerHTML = `
    <div style="max-width:700px; margin:0 auto; padding:20px; color:#fff;">
      <h2>📝 ${test.title}</h2>
      <div id="examTimer" style="background:#334155; padding:10px; border-radius:8px; margin-bottom:15px; font-weight:bold; text-align:center;">Time Remaining: <span id="timeLeft">Calculating...</span></div>
      <form id="activeExamForm" onsubmit="event.preventDefault(); submitActiveExam();">
        ${questionsHTML}
        <button type="submit" style="background:#10b981; color:#fff; padding:12px 20px; border:none; border-radius:8px; font-weight:bold; width:100%; cursor:pointer; margin-top:10px;">Submit Exam</button>
      </form>
    </div>
  `;

  // Start timer and proctoring
  examTimeRemaining = (test.durationMinutes || 15) * 60;
  startExamTimer();
  startExamProctoring();
}

function startExamTimer() {
  clearInterval(examTimerInterval);
  const timerDisplay = document.getElementById("timeLeft");
  
  examTimerInterval = setInterval(() => {
    if (examTimeRemaining <= 0) {
      clearInterval(examTimerInterval);
      alert("Time is up! Auto-submitting exam.");
      submitActiveExam();
      return;
    }
    
    let minutes = Math.floor(examTimeRemaining / 60);
    let seconds = examTimeRemaining % 60;
    if (timerDisplay) {
      timerDisplay.innerText = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }
    examTimeRemaining--;
  }, 1000);
}

async function submitActiveExam() {
  clearInterval(examTimerInterval);
  isExamActive = false;

  const userId = localStorage.getItem("userId");
  if (!userId || !currentActiveTest) return;

  const timeTakenMinutes = Math.floor(((currentActiveTest.durationMinutes * 60) - examTimeRemaining) / 60);
  const timeTakenSeconds = ((currentActiveTest.durationMinutes * 60) - examTimeRemaining) % 60;
  const timeTakenStr = `${timeTakenMinutes}m ${timeTakenSeconds}s`;

  try {
    const res = await fetch('/api/exam/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        testId: currentActiveTest._id,
        answers: studentAnswers,
        timeTaken: timeTakenStr
      })
    });

    const data = await res.json();
    alert(data.message || "Exam submitted successfully!");
    window.location.href = "student-dashboard.html";
  } catch (err) {
    console.error("Error submitting exam:", err);
    alert("Error submitting exam.");
    window.location.href = "student-dashboard.html";
  }
}