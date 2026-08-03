// --- ADMIN & STUDENT CORE PORTAL SCRIPTS ---

document.addEventListener('DOMContentLoaded', () => {
  // Mobile/iPad Touch Event Fix for Dynamic and Static Buttons
  const fixTouchEvents = () => {
    document.querySelectorAll('button, .action-btn, select, input[type="submit"]').forEach(el => {
      if (!el.dataset.touchFixed) {
        el.dataset.touchFixed = 'true';
        el.addEventListener('touchend', (e) => {
          e.preventDefault();
          el.click();
        }, { passive: false });
      }
    });
  };

  fixTouchEvents();
  const observer = new MutationObserver(fixTouchEvents);
  observer.observe(document.body, { childList: true, subtree: true });

  // Live Auto-Refresh Polling for Student Portal (Every 15s)
  const currentStudentId = localStorage.getItem('userId');
  const userRole = localStorage.getItem('role');
  if (currentStudentId && userRole === 'student') {
    setInterval(() => {
      fetch(`/api/student/classroom-data/${currentStudentId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && typeof loadStudentData === 'function') {
            loadStudentData();
          }
        })
        .catch(err => console.error("Auto-refresh sync error:", err));
    }, 15000);
  }
});

// Global Question Field Generator with Separate Option Inputs
function addQuestionField() {
  const container = document.getElementById('questionsContainer');
  if (!container) return;
  
  window.questionCount = (window.questionCount || 0) + 1;
  const qId = window.questionCount;

  const div = document.createElement('div');
  div.className = 'input-group';
  div.style.background = 'rgba(30,41,59,0.5)';
  div.style.padding = '15px';
  div.style.borderRadius = '10px';
  div.style.marginBottom = '15px';
  div.style.border = '1px solid rgba(255,255,255,0.05)';

  div.innerHTML = `
    <label style="color:#38bdf8; font-weight:bold; margin-bottom:6px; display:block;">Question ${qId}</label>
    <input type="text" id="qText_${qId}" placeholder="Enter question text" style="margin-bottom:10px;" />
    
    <label style="font-size:12px; color:#94a3b8; margin-bottom:4px; display:block;">Option 1</label>
    <input type="text" id="qOpt1_${qId}" placeholder="Enter Option A" style="margin-bottom:8px;" />

    <label style="font-size:12px; color:#94a3b8; margin-bottom:4px; display:block;">Option 2</label>
    <input type="text" id="qOpt2_${qId}" placeholder="Enter Option B" style="margin-bottom:8px;" />

    <label style="font-size:12px; color:#94a3b8; margin-bottom:4px; display:block;">Option 3</label>
    <input type="text" id="qOpt3_${qId}" placeholder="Enter Option C" style="margin-bottom:8px;" />

    <label style="font-size:12px; color:#94a3b8; margin-bottom:4px; display:block;">Option 4</label>
    <input type="text" id="qOpt4_${qId}" placeholder="Enter Option D" style="margin-bottom:10px;" />

    <label style="font-size:12px; color:#38bdf8; margin-bottom:4px; display:block;">Correct Answer (Exact match to one option above)</label>
    <input type="text" id="qAns_${qId}" placeholder="e.g. Option A text" />
  `;
  container.appendChild(div);
}

// Global Assessment Test Submission Publisher with Separate Option Fields
async function submitNewTest() {
  const classroomId = document.getElementById('testClassSelect').value;
  const title = document.getElementById('testTitle').value;
  const durationMinutes = Number(document.getElementById('testDuration').value) || 15;
  const durationHours = Number(document.getElementById('testDurationHours').value) || 24;

  if (!title || !classroomId) return alert("Please fill in the test title and select a classroom cohort.");

  const questions = [];
  for (let i = 1; i <= (window.questionCount || 0); i++) {
    const qTextEl = document.getElementById(`qText_${i}`);
    const opt1 = document.getElementById(`qOpt1_${i}`);
    const opt2 = document.getElementById(`qOpt2_${i}`);
    const opt3 = document.getElementById(`qOpt3_${i}`);
    const opt4 = document.getElementById(`qOpt4_${i}`);
    const qAnsEl = document.getElementById(`qAns_${i}`);

    if (qTextEl && qTextEl.value.trim() !== '') {
      const options = [
        opt1 ? opt1.value.trim() : '',
        opt2 ? opt2.value.trim() : '',
        opt3 ? opt3.value.trim() : '',
        opt4 ? opt4.value.trim() : ''
      ].filter(o => o !== '');

      questions.push({
        questionText: qTextEl.value.trim(),
        options: options,
        correctAnswer: qAnsEl.value.trim()
      });
    }
  }

  if (questions.length === 0) return alert("Please add at least one question before publishing the test.");

  const res = await fetch('/api/admin/tests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classroomId, title, durationMinutes, durationHours, questions })
  });
  const data = await res.json();
  alert(data.message);
  if (data.success) {
    document.getElementById('testTitle').value = '';
    document.getElementById('questionsContainer').innerHTML = '';
    window.questionCount = 0;
    if (typeof loadAdminTests === 'function') loadAdminTests();
  }
}

// Cohort Creation Helper
async function createClassroomCohort() {
  const name = document.getElementById('cohortName').value;
  const description = document.getElementById('cohortDesc').value;
  const adminId = localStorage.getItem('userId');

  if (!name) return alert("Please enter a classroom name.");
  const res = await fetch('/api/admin/classrooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, adminId })
  });
  const data = await res.json();
  alert(data.message);
  if(data.success) {
    document.getElementById('cohortName').value = '';
    document.getElementById('cohortDesc').value = '';
    if(typeof loadAdminData === 'function') loadAdminData();
  }
}

// Live Class Publisher Helper
async function postLiveClass() {
  const classroomId = document.getElementById('classLiveSelect').value;
  const title = document.getElementById('classTitle').value;
  const meetLink = document.getElementById('meetLink').value;

  if(!title || !meetLink) return alert("Fill in both class title and Google Meet URL.");
  const res = await fetch('/api/admin/class', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classroomId, title, meetLink })
  });
  const data = await res.json();
  alert(data.message);
  if(data.success) {
    document.getElementById('classTitle').value = '';
    document.getElementById('meetLink').value = '';
  }
}

// Study Note Publisher Helper
async function uploadNote() {
  const classroomId = document.getElementById('noteClassSelect').value;
  const title = document.getElementById('noteTitle').value;
  const contentOrLink = document.getElementById('noteLink').value;

  if(!title || !contentOrLink) return alert("Fill in note title and document link.");
  const res = await fetch('/api/admin/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classroomId, title, contentOrLink })
  });
  const data = await res.json();
  alert(data.message);
  if(data.success) {
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteLink').value = '';
  }
}