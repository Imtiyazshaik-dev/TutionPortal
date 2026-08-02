const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://imtiyaz:imtiyaz@cluster0.0v70fku.mongodb.net/tutionportal?retryWrites=true&w=majority&appName=Cluster0";

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB Atlas
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("MongoDB Connected Successfully via Mongoose!");
    console.log("Connected to Database Name:", mongoose.connection.name);
    await seedDefaultAdmin();
  })
  .catch(err => console.error("MongoDB Connection Error:", err));

// --- SCHEMAS & MODELS ---
const classroomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  createdAt: { type: Date, default: Date.now }
});

const studentSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'student'], default: 'student' },
  studentIdTag: { type: String },
  classroomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  xp: { type: Number, default: 0 },
  attendance: [{ date: String, status: String }],
  badges: [String],
  strikes: { type: Number, default: 0 }
});

const testSchema = new mongoose.Schema({
  classroomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
  title: { type: String, required: true },
  durationMinutes: { type: Number, default: 15 },
  durationHours: { type: Number, default: 24 },
  questions: [{
    questionText: String,
    options: [String],
    correctAnswer: String
  }],
  createdAt: { type: Date, default: Date.now }
});

const resultSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  score: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  timeTaken: { type: String },
  xpGranted: { type: Boolean, default: false },
  grantedXpAmount: { type: Number, default: 0 },
  submittedAt: { type: Date, default: Date.now }
});

const liveClassSchema = new mongoose.Schema({
  classroomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
  title: { type: String, required: true },
  meetLink: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const attendanceRequestSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass' },
  classTitle: String,
  date: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
});

const noteSchema = new mongoose.Schema({
  classroomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
  title: { type: String, required: true },
  contentOrLink: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

const weeklyReportSchema = new mongoose.Schema({
  reportType: { type: String, enum: ['student', 'master'], required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Classroom = mongoose.model('Classroom', classroomSchema);
const Student = mongoose.model('Student', studentSchema);
const Test = mongoose.model('Test', testSchema);
const Result = mongoose.model('Result', resultSchema);
const LiveClass = mongoose.model('LiveClass', liveClassSchema);
const AttendanceRequest = mongoose.model('AttendanceRequest', attendanceRequestSchema);
const Note = mongoose.model('Note', noteSchema);
const WeeklyReport = mongoose.model('WeeklyReport', weeklyReportSchema);

async function checkAndAwardBadges(studentId) {
  const student = await Student.findById(studentId);
  if (!student) return;

  const resultsCount = await Result.countDocuments({ studentId: student._id });
  const currentBadges = student.badges || [];
  let updated = false;

  const award = (badgeName) => {
    if (!currentBadges.includes(badgeName)) {
      currentBadges.push(badgeName);
      updated = true;
    }
  };

  if (resultsCount >= 1) award("🎯 First Step");
  if (student.xp >= 30) award("🥉 Bronze Scholar (30+ XP)");
  if (student.xp >= 45) award("🥈 Silver Achiever (45+ XP)");
  if (student.xp >= 70) award("🥇 Gold Elite (70 XP Weekly Max)");

  const perfectTests = await Result.findOne({ studentId: student._id, grantedXpAmount: 10 });
  if (perfectTests) award("⭐ Perfectionist (10/10 XP)");

  if (student.attendance && student.attendance.length >= 3) {
    award("📚 Consistent Learner (3+ Classes)");
  }

  if (updated) {
    student.badges = currentBadges;
    await student.save();
  }
}

async function seedDefaultAdmin() {
  try {
    const adminExists = await Student.findOne({ username: 'admin' });
    if (!adminExists) {
      await Student.create({
        username: 'admin',
        password: 'adminpassword123',
        role: 'admin',
        status: 'approved',
        studentIdTag: 'ADMIN-001'
      });
      console.log("Default master admin account created: admin / adminpassword123");
    }
  } catch (err) {
    console.error("Error seeding admin:", err);
  }
}

// Helper builder for Visual HTML Reports
async function buildMasterReportHtml() {
  const students = await Student.find({ role: 'student', status: 'approved' });
  let masterHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Weekly Master Report - Tuition Portal</title>
      <style>
        body { font-family: 'Outfit', 'Segoe UI', sans-serif; background: #090d16; color: #f8fafc; margin: 0; padding: 40px 20px; }
        .container { max-width: 850px; margin: auto; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); padding: 40px; border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 50px rgba(0,0,0,0.6); }
        h1 { color: #fff; font-size: 26px; text-align: center; background: linear-gradient(135deg, #fff, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 5px; }
        .subtitle { text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 30px; }
        .student-card { background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); padding: 22px; border-radius: 16px; margin-bottom: 20px; }
        .student-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 10px; }
        .progress-bar-bg { background: rgba(15, 23, 42, 0.8); border-radius: 10px; overflow: hidden; height: 18px; margin: 12px 0; border: 1px solid rgba(255,255,255,0.05); }
        .progress-bar-fill { background: linear-gradient(90deg, #0284c7, #10b981); height: 100%; text-align: right; color: #fff; font-size: 11px; font-weight: bold; padding-right: 8px; line-height: 18px; }
        .badge-tag { background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.3); color: #38bdf8; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; display: inline-block; margin: 3px; }
        ul { margin: 8px 0 0 0; padding-left: 20px; color: #cbd5e1; font-size: 13px; }
        li { margin-bottom: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📊 Weekly Performance Master Report</h1>
        <div class="subtitle">Generated on: ${new Date().toLocaleString()}</div>
  `;

  for (const student of students) {
    const results = await Result.find({ studentId: student._id }).populate('testId', 'title');
    let xpPercentage = Math.min(100, Math.round((student.xp / 70) * 100));

    masterHtml += `
      <div class="student-card">
        <div class="student-header">
          <div>
            <strong style="font-size: 18px; color: #fff;">${student.username}</strong> 
            <span style="font-size: 12px; color: #f59e0b; margin-left: 8px;">ID: ${student.studentIdTag || 'N/A'}</span>
          </div>
          <div style="font-size: 14px; font-weight: bold; color: #10b981;">Total XP: ${student.xp} / 70 max</div>
        </div>
        <p style="margin: 0; font-size: 13px; color: #94a3b8;">Classes Attended: <strong style="color:#f8fafc;">${student.attendance.length}</strong></p>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${xpPercentage}%;">${xpPercentage}%</div>
        </div>
        <div style="margin-top: 10px;">
          <span style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 4px;">Badges Earned:</span>
          ${(student.badges && student.badges.length > 0) ? student.badges.map(b => `<span class="badge-tag">${b}</span>`).join('') : '<span style="font-size:12px; color:#64748b;">None yet</span>'}
        </div>
        <div style="margin-top: 12px;">
          <span style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 4px;">Test Breakdown:</span>
          <ul>
            ${results.length > 0 ? results.map(r => `<li><strong>${r.testId ? r.testId.title : 'Test'}</strong>: Score ${r.score}/${r.totalQuestions} | XP Granted: <span style="color:#10b981;">${r.grantedXpAmount || 0} XP</span></li>`).join('') : '<li style="color:#64748b;">No tests submitted this week.</li>'}
          </ul>
        </div>
      </div>
    `;
  }
  masterHtml += `</div></body></html>`;
  return masterHtml;
}

async function buildStudentReportHtml(studentId) {
  const student = await Student.findById(studentId);
  if (!student) return '';

  const results = await Result.find({ studentId: student._id }).populate('testId', 'title');
  let xpPercentage = Math.min(100, Math.round((student.xp / 70) * 100));

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Your Weekly Performance Report</title>
      <style>
        body { font-family: 'Outfit', 'Segoe UI', sans-serif; background: #090d16; color: #f8fafc; margin: 0; padding: 40px 20px; }
        .container { max-width: 700px; margin: auto; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); padding: 40px; border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 50px rgba(0,0,0,0.6); }
        h1 { color: #fff; font-size: 24px; text-align: center; background: linear-gradient(135deg, #fff, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 5px; }
        .subtitle { text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 25px; }
        .stat-box { background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); padding: 24px; border-radius: 16px; text-align: center; margin-bottom: 25px; }
        .progress-bar-bg { background: rgba(15, 23, 42, 0.8); border-radius: 12px; overflow: hidden; height: 20px; margin: 15px 0 5px 0; border: 1px solid rgba(255,255,255,0.05); }
        .progress-bar-fill { background: linear-gradient(90deg, #0284c7, #10b981); height: 100%; text-align: right; color: #fff; font-size: 12px; font-weight: bold; padding-right: 10px; line-height: 20px; }
        .badge-tag { background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.3); color: #38bdf8; padding: 6px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; display: inline-block; margin: 4px; }
        ul { margin: 10px 0 0 0; padding-left: 20px; color: #cbd5e1; font-size: 14px; }
        li { margin-bottom: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>⭐ Your Weekly Performance Report</h1>
        <div class="subtitle">Student: <strong>${student.username}</strong> (${student.studentIdTag || 'N/A'})</div>
        
        <div class="stat-box">
          <span style="color: #94a3b8; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Weekly XP Goal (70 Max)</span>
          <div style="font-size: 38px; font-weight: bold; color: #f59e0b; margin: 5px 0;">${student.xp} XP</div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${xpPercentage}%;">${xpPercentage}%</div>
          </div>
          <div style="font-size: 12px; color: #94a3b8; margin-top: 8px;">Classes Attended: <strong style="color:#10b981;">${student.attendance.length}</strong></div>
        </div>

        <h3 style="color: #38bdf8; font-size: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 10px; margin-bottom: 15px;">🏅 Badges & Achievements</h3>
        <div style="margin-bottom: 25px;">
          ${(student.badges && student.badges.length > 0) ? student.badges.map(b => `<span class="badge-tag">${b}</span>`).join('') : '<span style="color:#94a3b8; font-size: 13px;">No badges unlocked yet. Keep participating!</span>'}
        </div>

        <h3 style="color: #38bdf8; font-size: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 10px; margin-bottom: 15px;">📝 Test Submissions & Scores</h3>
        <ul>
          ${results.length > 0 ? results.map(r => `<li><strong>${r.testId ? r.testId.title : 'Test'}</strong>: Score ${r.score}/${r.totalQuestions} | XP Granted: <span style="color:#10b981; font-weight:bold;">${r.grantedXpAmount || 0} XP</span></li>`).join('') : '<li style="color:#94a3b8;">No tests submitted this week.</li>'}
        </ul>

        <div style="text-align: center; margin-top: 35px; color: #10b981; font-weight: 600; font-size: 14px;">Keep up the fantastic work! 🚀</div>
      </div>
    </body>
    </html>
  `;
}

async function generateWeeklyReports() {
  try {
    const students = await Student.find({ role: 'student', status: 'approved' });
    const masterHtml = await buildMasterReportHtml();

    await WeeklyReport.deleteMany({ reportType: 'master' });
    await WeeklyReport.create({ reportType: 'master', content: masterHtml });

    for (const student of students) {
      const studentHtml = await buildStudentReportHtml(student._id);
      await WeeklyReport.deleteMany({ studentId: student._id, reportType: 'student' });
      await WeeklyReport.create({ reportType: 'student', studentId: student._id, content: studentHtml });
    }
    console.log("Visual HTML Weekly Reports generated successfully!");
  } catch (err) {
    console.error("Error generating weekly reports:", err);
  }
}

setInterval(() => {
  const now = new Date();
  if (now.getDay() === 0) {
    generateWeeklyReports();
  }
}, 24 * 60 * 60 * 1000);

// --- MONTHLY REPORT ARCHIVE API ROUTE WITH DATA VALIDATION ---
app.get('/api/admin/monthly-report/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    // Prevent querying future months where no data exists
    if (startDate > new Date()) {
      return res.status(400).send('<!DOCTYPE html><html><body style="background:#090d16;color:#fff;font-family:sans-serif;text-align:center;padding-top:50px;"><h2>⚠️ No Data Found</h2><p>Cannot generate reports for future months.</p></body></html>');
    }

    const students = await Student.find({ role: 'student', status: 'approved' });
    const totalSubmissions = await Result.countDocuments({ submittedAt: { $gte: startDate, $lt: endDate } });

    if (students.length === 0 || totalSubmissions === 0) {
      return res.status(404).send('<!DOCTYPE html><html><body style="background:#090d16;color:#fff;font-family:sans-serif;text-align:center;padding-top:50px;"><h2>⚠️ No Data Found</h2><p>No student activity or test submissions recorded for this month.</p></body></html>');
    }

    let monthlyHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Monthly Performance Report - ${month}/${year}</title>
        <style>
          body { font-family: 'Outfit', 'Segoe UI', sans-serif; background: #090d16; color: #f8fafc; margin: 0; padding: 40px 20px; }
          .container { max-width: 850px; margin: auto; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); padding: 40px; border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 50px rgba(0,0,0,0.6); }
          h1 { color: #fff; font-size: 26px; text-align: center; background: linear-gradient(135deg, #fff, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 5px; }
          .subtitle { text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 30px; }
          .student-card { background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); padding: 22px; border-radius: 16px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📅 Monthly Performance Archive Report (${month}/${year})</h1>
          <div class="subtitle">Compiled on: ${new Date().toLocaleString()}</div>
    `;

    for (const student of students) {
      const results = await Result.find({ 
        studentId: student._id, 
        submittedAt: { $gte: startDate, $lt: endDate } 
      }).populate('testId', 'title');

      if (results.length > 0) {
        monthlyHtml += `
          <div class="student-card">
            <strong style="font-size: 18px; color: #fff;">${student.username}</strong> <span style="font-size: 12px; color: #f59e0b;">(ID: ${student.studentIdTag || 'N/A'})</span>
            <p style="margin: 6px 0; font-size: 14px; color: #94a3b8;">Total XP: <strong style="color:#10b981;">${student.xp}</strong></p>
            <p style="margin: 4px 0; font-size: 13px; color: #cbd5e1;">Tests Completed This Month: <strong>${results.length}</strong></p>
          </div>
        `;
      }
    }

    monthlyHtml += `</div></body></html>`;

    res.setHeader('Content-disposition', `attachment; filename=monthly-report-${year}-${month}.html`);
    res.setHeader('Content-type', 'text/html');
    res.send(monthlyHtml);
  } catch (err) {
    res.status(500).send('Error generating monthly report.');
  }
});

// --- AUTHENTICATION & OTHER ROUTES ---
app.post('/api/auth', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await Student.findOne({ username, password });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    if (user.role === 'student' && user.status !== 'approved') {
      return res.status(403).json({ success: false, message: `Your account status is currently ${user.status}.` });
    }
    res.json({ success: true, userId: user._id, role: user.role, username: user.username });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    const user = await Student.findById(userId);
    if (!user || user.password !== oldPassword) return res.status(400).json({ success: false, message: 'Incorrect old password.' });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/classrooms/:adminId', async (req, res) => {
  try {
    const adminUser = await Student.findById(req.params.adminId);
    if (!adminUser) return res.status(404).json({ success: false, message: 'Admin not found.' });
    let classrooms = adminUser.username === 'admin' ? await Classroom.find().populate('createdBy', 'username').sort({ createdAt: -1 }) : await Classroom.find({ $or: [{ createdBy: adminUser._id }, { createdBy: { $exists: false } }] }).populate('createdBy', 'username').sort({ createdAt: -1 });
    res.json({ success: true, classrooms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/classrooms', async (req, res) => {
  try {
    const { name, description, adminId } = req.body;
    await Classroom.create({ name, description, createdBy: adminId });
    res.json({ success: true, message: 'Classroom cohort created successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/student/classroom-data/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    if (!student.classroomId) return res.json({ success: true, assigned: false, student });

    await checkAndAwardBadges(student._id);
    const updatedStudent = await Student.findById(student._id);
    const classroom = await Classroom.findById(student.classroomId);
    const leaderboard = await Student.find({ classroomId: student.classroomId, status: 'approved' }).sort({ xp: -1 }).select('username xp studentIdTag');
    const allTests = await Test.find({ classroomId: student.classroomId }).sort({ _id: -1 });
    const now = new Date().getTime();

    const availableTests = allTests.map(test => {
      const createdTime = test.createdAt ? new Date(test.createdAt).getTime() : test._id.getTimestamp().getTime();
      const expirationHours = test.durationHours || 24;
      const expirationTime = createdTime + (expirationHours * 60 * 60 * 1000);
      return { _id: test._id, title: test.title, durationMinutes: test.durationMinutes, isUnlocked: now <= expirationTime, statusMessage: now <= expirationTime ? `Active (${expirationHours}h Window)` : "Expired & Locked" };
    });

    const notes = await Note.find({ classroomId: student.classroomId }).sort({ uploadedAt: -1 });
    const activeClass = await LiveClass.findOne({ classroomId: student.classroomId, isActive: true });
    const submittedResults = await Result.find({ studentId: student._id });
    
    // Dynamic generation check for student report HTML
    let report = await WeeklyReport.findOne({ studentId: student._id, reportType: 'student' });
    if (!report) {
      const htmlContent = await buildStudentReportHtml(student._id);
      report = await WeeklyReport.create({ reportType: 'student', studentId: student._id, content: htmlContent });
    }

    res.json({
      success: true,
      assigned: true,
      classroom,
      student: updatedStudent,
      leaderboard,
      tests: availableTests,
      notes,
      activeClass,
      submittedResults: submittedResults.map(r => r.testId.toString()),
      hasReport: !!report,
      reportId: report ? report._id : null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/student/join-class', async (req, res) => {
  try {
    const { userId, classId, classTitle } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const existingReq = await AttendanceRequest.findOne({ studentId: userId, classId, date: today });
    if (!existingReq) {
      await AttendanceRequest.create({ studentId: userId, classId, classTitle: classTitle || 'Live Class Session', date: today });
    }
    res.json({ success: true, message: 'Attendance request sent!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/tests/:id', async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ success: false, message: 'Test not found.' });
    res.json({ success: true, test });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/exam/submit', async (req, res) => {
  try {
    const { userId, testId, answers, timeTaken } = req.body;
    const existingSubmission = await Result.findOne({ studentId: userId, testId });
    if (existingSubmission) {
      return res.status(400).json({ success: false, message: 'You have already submitted this exam and cannot retake it.' });
    }

    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ success: false, message: 'Test not found.' });

    let score = 0;
    test.questions.forEach((q, idx) => {
      if (answers[idx] === q.correctAnswer) score++;
    });

    await Result.create({ studentId: userId, testId, score, totalQuestions: test.questions.length, timeTaken, xpGranted: false, grantedXpAmount: 0, submittedAt: new Date() });
    await checkAndAwardBadges(userId);
    res.json({ success: true, message: `Exam submitted successfully! Score: ${score}/${test.questions.length}.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/exam/strike', async (req, res) => {
  try {
    const { userId } = req.body;
    const student = await Student.findById(userId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    student.strikes += 1;
    await student.save();
    res.json({ success: true, terminated: student.strikes >= 3, message: student.strikes >= 3 ? 'Maximum tab-switch violations reached!' : `Warning! Strike ${student.strikes}/3.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/pending-students/:adminId', async (req, res) => {
  try {
    const pendingStudents = await Student.find({ role: 'student', status: 'pending' }).populate('classroomId', 'name');
    res.json({ success: true, students: pendingStudents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/approved-students/:adminId', async (req, res) => {
  try {
    const approvedStudents = await Student.find({ role: 'student', status: 'approved' }).populate('classroomId', 'name');
    res.json({ success: true, students: approvedStudents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/enroll', async (req, res) => {
  try {
    const { username, password, phone, classroomId } = req.body;
    const existing = await Student.findOne({ username });
    if (existing) return res.status(400).json({ success: false, message: 'Username already exists' });

    const studentIdTag = `STU-${Date.now().toString().slice(-4)}${Math.floor(100 + Math.random() * 900)}`;
    await Student.create({ username: username.trim(), password, role: 'student', status: 'pending', studentIdTag, classroomId, xp: 0, badges: [], strikes: 0 });
    
    let whatsappUrl = '';
    if (phone && phone.trim() !== '') {
      whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(`Hey! You have been enrolled in Tuition Portal.\nUsername: ${username}\nPassword: ${password}`)}`;
    }
    res.json({ success: true, message: 'Student enrolled successfully!', whatsappUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/student-status', async (req, res) => {
  try {
    const { studentId, status } = req.body;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    student.status = status;
    await student.save();
    res.json({ success: true, message: `Student status updated to ${status}.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/student/:id', async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    await Result.deleteMany({ studentId: req.params.id });
    res.json({ success: true, message: 'Student account deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/attendance-requests', async (req, res) => {
  try {
    const requests = await AttendanceRequest.find({ status: 'pending' }).populate('studentId', 'username studentIdTag');
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/attendance-action', async (req, res) => {
  try {
    const { requestId, action } = req.body;
    const reqDoc = await AttendanceRequest.findById(requestId);
    if (!reqDoc) return res.status(404).json({ success: false, message: 'Request not found.' });
    reqDoc.status = action === 'approve' ? 'approved' : 'rejected';
    await reqDoc.save();

    if (action === 'approve') {
      const student = await Student.findById(reqDoc.studentId);
      if (student) {
        student.attendance.push({ date: reqDoc.date, status: 'Present' });
        await student.save();
        await checkAndAwardBadges(student._id);
      }
    }
    res.json({ success: true, message: `Attendance request ${action}ed!` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/attendance', async (req, res) => {
  try {
    const { studentId, date, status } = req.body;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    student.attendance = student.attendance.filter(a => a.date !== date);
    student.attendance.push({ date, status });
    await student.save();
    await checkAndAwardBadges(studentId);
    res.json({ success: true, message: 'Attendance saved successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/xp', async (req, res) => {
  try {
    const { studentId, xpAmount, action } = req.body;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    student.xp = action === 'add' ? student.xp + Number(xpAmount) : Math.max(0, student.xp - Number(xpAmount));
    await student.save();
    await checkAndAwardBadges(studentId);
    res.json({ success: true, message: 'Student XP updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/results', async (req, res) => {
  try {
    const results = await Result.find().populate('studentId', 'username studentIdTag').populate('testId', 'title');
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/grant-exam-xp', async (req, res) => {
  try {
    const { resultId, xpAmount } = req.body;
    const result = await Result.findById(resultId);
    if (!result) return res.status(404).json({ success: false, message: 'Result not found.' });

    const amount = Number(xpAmount) || 0;
    if (amount > 10) return res.status(400).json({ success: false, message: 'Max total XP for any test is 10.' });

    const student = await Student.findById(result.studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    student.xp += (amount - (result.grantedXpAmount || 0));
    await student.save();

    result.xpGranted = true;
    result.grantedXpAmount = amount;
    await result.save();
    await checkAndAwardBadges(student._id);

    res.json({ success: true, message: `Granted ${amount} XP successfully!` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/reset-exam', async (req, res) => {
  try {
    const { studentId, testId } = req.body;
    const existingResult = await Result.findOne({ studentId, testId });
    if (existingResult && existingResult.xpGranted && existingResult.grantedXpAmount > 0) {
      const student = await Student.findById(studentId);
      if (student) {
        student.xp = Math.max(0, student.xp - existingResult.grantedXpAmount);
        await student.save();
        await checkAndAwardBadges(studentId);
      }
    }
    await Result.findOneAndDelete({ studentId, testId });
    res.json({ success: true, message: 'Exam submission reset.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/class', async (req, res) => {
  try {
    const { classroomId, title, meetLink } = req.body;
    await LiveClass.updateMany({ classroomId }, { isActive: false });
    await LiveClass.create({ classroomId, title, meetLink, isActive: true });
    res.json({ success: true, message: 'Live class published!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/classes', async (req, res) => {
  try {
    const classes = await LiveClass.find().populate('classroomId', 'name').sort({ createdAt: -1 });
    res.json({ success: true, classes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/class/:id', async (req, res) => {
  try {
    await LiveClass.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Class deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/tests', async (req, res) => {
  try {
    const { classroomId, title, durationMinutes, durationHours, questions } = req.body;
    await Test.create({ classroomId, title, durationMinutes, durationHours: durationHours || 24, questions });
    res.json({ success: true, message: 'Test published successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/tests', async (req, res) => {
  try {
    const tests = await Test.find().populate('classroomId', 'name');
    res.json({ success: true, tests });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/test/:id', async (req, res) => {
  try {
    await Test.findByIdAndDelete(req.params.id);
    await Result.deleteMany({ testId: req.params.id });
    res.json({ success: true, message: 'Test deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/notes', async (req, res) => {
  try {
    const { classroomId, title, contentOrLink } = req.body;
    await Note.create({ classroomId, title, contentOrLink });
    res.json({ success: true, message: 'Note uploaded!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/notes', async (req, res) => {
  try {
    const notes = await Note.find().populate('classroomId', 'name').sort({ uploadedAt: -1 });
    res.json({ success: true, notes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/note/:id', async (req, res) => {
  try {
    await Note.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Note deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/reports-check', async (req, res) => {
  try {
    const masterReport = await WeeklyReport.findOne({ reportType: 'master' });
    if (!masterReport) {
      const htmlContent = await buildMasterReportHtml();
      await WeeklyReport.create({ reportType: 'master', content: htmlContent });
    }
    const report = await WeeklyReport.findOne({ reportType: 'master' });
    res.json({ success: true, hasReport: !!report, reportId: report ? report._id : null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reports/download/:id', async (req, res) => {
  try {
    let report = await WeeklyReport.findById(req.params.id);
    if (!report) return res.status(404).send('Report not found.');

    // Ensure dynamic re-rendering on download for fresh data & styles
    let htmlOutput = report.reportType === 'master' ? await buildMasterReportHtml() : await buildStudentReportHtml(report.studentId);

    res.setHeader('Content-disposition', `attachment; filename=${report.reportType}-weekly-report.html`);
    res.setHeader('Content-type', 'text/html');
    res.send(htmlOutput);
  } catch (err) {
    res.status(500).send('Error downloading report.');
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "https://www.tutorpoint.page";

setInterval(() => {
  const protocol = RENDER_URL.startsWith('https') ? https : http;
  protocol.get(`${RENDER_URL}`, (res) => {
    console.log(`Keep-alive ping sent. Status: ${res.statusCode}`);
  }).on('error', (err) => {
    console.error("Keep-alive ping error:", err.message);
  });
}, 10 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server running smoothly on http://localhost:${PORT}`);
});