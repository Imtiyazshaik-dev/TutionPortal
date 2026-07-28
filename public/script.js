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
        const response = await fetch("http://localhost:3000/api/auth", {
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
    const response = await fetch('http://localhost:3000/api/exam/strike', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });

    const data = await response.json();

    if (data.success) {
      alert(data.message);
      if (data.terminated) {
        isExamActive = false;
        window.location.href = "student-dashboard.html";
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
    const response = await fetch("http://localhost:3000/api/admin/reset-exam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, testId })
    });

    const data = await response.json();
    alert(data.message);
  } catch (err) {
    console.error("Error resetting student exam:", err);
  }
}