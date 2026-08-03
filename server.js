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

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("MongoDB Connected Successfully via Mongoose!");
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
  strikes: { type: Number, default: 0 },
  remarks: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const holidaySchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true },
  title: { type: String, default: 'Holiday' }
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
const Holiday = mongoose.model('Holiday', holidaySchema);
const Test = mongoose.model('Test', testSchema);
const Result = mongoose.model('Result', resultSchema);
const LiveClass = mongoose.model('LiveClass', liveClassSchema);
const AttendanceRequest = mongoose.model('AttendanceRequest', attendanceRequestSchema);
const Note = mongoose.model('Note', noteSchema);
const WeeklyReport = mongoose.model('WeeklyReport', weeklyReportSchema);

// --- BULLETPROOF ATTENDANCE CALCULATION ENGINE ---
async function calculateAttendanceStats(student) {
  try {
    const termStart = new Date('2026-08-01');
    termStart.setHours(0,0,0,0);

    const today = new Date('2026-08-03');
    today.setHours(0,0,0,0);

    const holidays = await Holiday.find({});
    const holidaySet = new Set(holidays.map(h => h.date));

    let totalWorkingDays = 0;
    let totalPresent = 0;
    const calendarMap = {};

    let curr = new Date(termStart);
    while (curr.getTime() <= today.getTime()) {
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, '0');
      const day = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      const dayOfWeek = curr.getDay();

      if (dayOfWeek === 0) {
        calendarMap[dateStr] = 'Sunday';
      } else if (holidaySet.has(dateStr)) {
        calendarMap[dateStr] = 'Holiday';
      } else {
        totalWorkingDays++;
        const record = (student.attendance || []).find(a => a.date === dateStr);
        if (record && record.status === 'Present') {
          totalPresent++;
          calendarMap[dateStr] = 'Present';
        } else {
          calendarMap[dateStr] = 'Absent';
        }
      }
      curr.setDate(curr.getDate() + 1);
    }

    const percentage = totalWorkingDays > 0 ? Number(((totalPresent / totalWorkingDays) * 100).toFixed(1)) : 100.0;
    return { percentage, totalWorkingDays, totalPresent, calendarMap };
  } catch (err) {
    console.error("Attendance calculation error:", err);
    return { percentage: 0, totalWorkingDays: 0, totalPresent: 0, calendarMap: {} };
  }
}

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

  const attStats = await calculateAttendanceStats(student);
  if (attStats.totalPresent >= 3) {
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
      console.log("Default master admin created.");
    }
  } catch (err) { console.error(err); }
}

async function buildMasterReportHtml() {
  const students = await Student.find({ role: 'student', status: 'approved' });
  let masterHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Weekly Master Report - Tuition Portal</title>
      <style>
        body { font-family: 'Outfit', sans-serif; background: #090d16; color: #f8fafc; margin: 0; padding: 40px 20px; }
        .container { max-width: 850px; margin: auto; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); padding: 40px; border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.08); }
        h1 { color: #fff; font-size: 26px; text-align: center; }
        .student-card { background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); padding: 22px; border-radius: 16px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📊 Weekly Performance Master Report</h1>
        <p style="text-align:center; color:#94a3b8;">Generated on: ${new Date().toLocaleString()}</p>
  `;

  for (const student of students) {
    const attStats = await calculateAttendanceStats(student);
    masterHtml += `
      <div class="student-card">
        <h3>${student.username} <span style="font-size:12px; color:#f59e0b;">(ID: ${student.studentIdTag || 'N/A'})</span></h3>
        <p>Total XP: <strong>${student.xp} / 70</strong> | Attendance: <strong style="color:#10b981;">${attStats.percentage}%</strong></p>
        <p>Badges: ${(student.badges || []).join(', ') || 'None'}</p>
        <p style="background:rgba(56,189,248,0.1); padding:10px; border-radius:8px; border-left:3px solid #38bdf8; font-size:14px;"><strong>💬 Teacher's Remarks for Parents:</strong> ${student.remarks || 'No remarks provided yet.'}</p>
      </div>
    `;
  }
  masterHtml += `</div></body></html>`;
  return masterHtml;
}

async function buildStudentReportHtml(studentId) {
  const student = await Student.findById(studentId);
  if (!student) return '';
  const attStats = await calculateAttendanceStats(student);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Your Weekly Performance Report</title>
      <style>
        body { font-family: 'Outfit', sans-serif; background: #090d16; color: #f8fafc; padding: 40px 20px; }
        .container { max-width: 700px; margin: auto; background: rgba(15, 23, 42, 0.85); padding: 40px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.08); }
        h1 { color: #38bdf8; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>⭐ Your Weekly Performance Report</h1>
        <p style="text-align:center; color:#94a3b8;">Student: <strong>${student.username}</strong> (${student.studentIdTag || 'N/A'})</p>
        <p style="text-align:center; font-size:24px; color:#f59e0b;">${student.xp} XP | Attendance: <strong style="color:#10b981;">${attStats.percentage}%</strong></p>
        <h3>🏅 Badges:</h3>
        <p>${(student.badges || []).join(', ') || 'No badges yet.'}</p>
        <div style="background:rgba(56,189,248,0.15); padding:15px; border-radius:12px; border-left:4px solid #38bdf8; margin-top:20px;">
          <h3 style="margin-top:0; color:#38bdf8;">💬 Teacher's Remarks (For Parents):</h3>
          <p style="font-size:15px; line-height:1.5; margin-bottom:0;">${student.remarks || 'No remarks provided this week.'}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// --- API ROUTES ---
app.post('/api/auth', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await Student.findOne({ username, password });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    if (user.role === 'student' && user.status !== 'approved') {
      return res.status(403).json({ success: false, message: `Account status is ${user.status}.` });
    }
    res.json({ success: true, userId: user._id, role: user.role, username: user.username });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    const user = await Student.findById(userId);
    if (!user || user.password !== oldPassword) return res.status(400).json({ success: false, message: 'Incorrect old password.' });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated!' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/classrooms/:adminId', async (req, res) => {
  try {
    const adminUser = await Student.findById(req.params.adminId);
    if (!adminUser) return res.status(404).json({ success: false, message: 'Admin not found.' });
    let classrooms = adminUser.username === 'admin' ? await Classroom.find().populate('createdBy', 'username').sort({ createdAt: -1 }) : await Classroom.find({ $or: [{ createdBy: adminUser._id }, { createdBy: { $exists: false } }] }).populate('createdBy', 'username').sort({ createdAt: -1 });
    res.json({ success: true, classrooms });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/classrooms', async (req, res) => {
  try {
    const { name, description, adminId } = req.body;
    await Classroom.create({ name, description, createdBy: adminId });
    res.json({ success: true, message: 'Classroom cohort created!' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/student/classroom-data/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    if (!student.classroomId) return res.json({ success: true, assigned: false, student });

    await checkAndAwardBadges(student._id);
    const updatedStudent = await Student.findById(student._id);
    const attStats = await calculateAttendanceStats(updatedStudent);

    const classroom = await Classroom.findById(student.classroomId);
    const leaderboardRaw = await Student.find({ classroomId: student.classroomId, status: 'approved' }).sort({ xp: -1 }).select('username xp studentIdTag attendance createdAt');
    
    const leaderboard = [];
    for (const s of leaderboardRaw) {
      const stats = await calculateAttendanceStats(s);
      leaderboard.push({
        _id: s._id,
        username: s.username,
        xp: s.xp,
        studentIdTag: s.studentIdTag,
        attendancePercentage: stats.percentage
      });
    }

    const allTests = await Test.find({ classroomId: student.classroomId }).sort({ _id: -1 });
    const now = new Date().getTime();
    const availableTests = allTests.map(test => {
      const createdTime = test.createdAt ? new Date(test.createdAt).getTime() : test._id.getTimestamp().getTime();
      const expirationTime = createdTime + ((test.durationHours || 24) * 60 * 60 * 1000);
      return { _id: test._id, title: test.title, durationMinutes: test.durationMinutes, isUnlocked: now <= expirationTime, statusMessage: now <= expirationTime ? `Active (${test.durationHours || 24}h Window)` : "Expired & Locked" };
    });

    const notes = await Note.find({ classroomId: student.classroomId }).sort({ uploadedAt: -1 });
    const activeClass = await LiveClass.findOne({ classroomId: student.classroomId, isActive: true });
    const submittedResults = await Result.find({ studentId: student._id });

    res.json({
      success: true,
      assigned: true,
      classroom,
      student: updatedStudent,
      attendanceStats: attStats,
      leaderboard,
      tests: availableTests,
      notes,
      activeClass,
      submittedResults: submittedResults.map(r => r.testId.toString())
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
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
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/tests/:id', async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ success: false, message: 'Test not found.' });
    res.json({ success: true, test });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/exam/submit', async (req, res) => {
  try {
    const { userId, testId, answers, timeTaken } = req.body;
    const existingSubmission = await Result.findOne({ studentId: userId, testId });
    if (existingSubmission) return res.status(400).json({ success: false, message: 'Already submitted.' });

    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ success: false, message: 'Test not found.' });

    let score = 0;
    test.questions.forEach((q, idx) => { if (answers[idx] === q.correctAnswer) score++; });

    await Result.create({ studentId: userId, testId, score, totalQuestions: test.questions.length, timeTaken, xpGranted: false, grantedXpAmount: 0, submittedAt: new Date() });
    await checkAndAwardBadges(userId);
    res.json({ success: true, message: `Exam submitted! Score: ${score}/${test.questions.length}.` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/exam/strike', async (req, res) => {
  try {
    const { userId } = req.body;
    const student = await Student.findById(userId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    student.strikes += 1;
    await student.save();
    res.json({ success: true, terminated: student.strikes >= 3, message: student.strikes >= 3 ? 'Max violations reached!' : `Warning! Strike ${student.strikes}/3.` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/admin/pending-students/:adminId', async (req, res) => {
  try {
    const pendingStudents = await Student.find({ role: 'student', status: 'pending' }).populate('classroomId', 'name');
    res.json({ success: true, students: pendingStudents });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/admin/approved-students/:adminId', async (req, res) => {
  try {
    const adminUser = await Student.findById(req.params.adminId);
    if (!adminUser) return res.status(404).json({ success: false, message: 'Admin not found.' });

    let studentsRaw;
    if (adminUser.username === 'admin') {
      studentsRaw = await Student.find({ role: 'student', status: 'approved' }).populate('classroomId', 'name');
    } else {
      const teacherClassrooms = await Classroom.find({ createdBy: adminUser._id }).select('_id');
      const classroomIds = teacherClassrooms.map(c => c._id);
      studentsRaw = await Student.find({ role: 'student', status: 'approved', classroomId: { $in: classroomIds } }).populate('classroomId', 'name');
      if (studentsRaw.length === 0) {
        studentsRaw = await Student.find({ role: 'student', status: 'approved' }).populate('classroomId', 'name');
      }
    }

    const students = [];
    for (const s of studentsRaw) {
      const stats = await calculateAttendanceStats(s);
      students.push({
        _id: s._id,
        username: s.username,
        studentIdTag: s.studentIdTag,
        classroomId: s.classroomId,
        xp: s.xp,
        attendancePercentage: stats.percentage,
        remarks: s.remarks || ''
      });
    }
    res.json({ success: true, students });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/enroll', async (req, res) => {
  try {
    const { username, password, phone, classroomId } = req.body;
    const existing = await Student.findOne({ username });
    if (existing) return res.status(400).json({ success: false, message: 'Username exists' });

    const studentIdTag = `STU-${Date.now().toString().slice(-4)}${Math.floor(100 + Math.random() * 900)}`;
    await Student.create({ username: username.trim(), password, role: 'student', status: 'pending', studentIdTag, classroomId, xp: 0, badges: [], strikes: 0, remarks: '', createdAt: new Date() });
    
    let whatsappUrl = '';
    if (phone && phone.trim() !== '') {
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length === 10) {
        cleanPhone = '91' + cleanPhone;
      }
      const message = `Hey! You have been enrolled in Tuition Portal.\nYour login credentials:\nUsername: ${username}\nPassword: ${password}`;
      whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    }
    res.json({ success: true, message: 'Student enrolled!', whatsappUrl });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/student-status', async (req, res) => {
  try {
    const { studentId, status } = req.body;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    student.status = status;
    student.createdAt = new Date();
    await student.save();
    res.json({ success: true, message: `Status updated to ${status}.` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/admin/student/:id', async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    await Result.deleteMany({ studentId: req.params.id });
    res.json({ success: true, message: 'Student deleted.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- ADMIN PASSWORD RESET ROUTE ---
app.post('/api/admin/reset-password', async (req, res) => {
  try {
    const { studentId, newPassword } = req.body;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    student.password = newPassword || 'student123';
    await student.save();
    res.json({ success: true, message: `Password reset successfully for ${student.username}!` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- ADMIN REMARKS ROUTE ---
app.post('/api/admin/remarks', async (req, res) => {
  try {
    const { studentId, remarks } = req.body;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    student.remarks = remarks;
    await student.save();
    res.json({ success: true, message: 'Teacher remarks saved successfully!' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- ADMIN HOLIDAY ROUTES ---
app.post('/api/admin/holiday', async (req, res) => {
  try {
    const { date, title } = req.body;
    if (!date) return res.status(400).json({ success: false, message: 'Date required.' });
    await Holiday.findOneAndUpdate({ date }, { date, title: title || 'Holiday' }, { upsert: true, new: true });
    res.json({ success: true, message: 'Holiday marked successfully!' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/admin/holidays', async (req, res) => {
  try {
    const holidays = await Holiday.find({}).sort({ date: 1 });
    res.json({ success: true, holidays });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/admin/holiday/:id', async (req, res) => {
  try {
    await Holiday.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Holiday removed.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/admin/attendance-requests', async (req, res) => {
  try {
    const requests = await AttendanceRequest.find({ status: 'pending' }).populate('studentId', 'username studentIdTag');
    res.json({ success: true, requests });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
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
        student.attendance = student.attendance.filter(a => a.date !== reqDoc.date);
        student.attendance.push({ date: reqDoc.date, status: 'Present' });
        await student.save();
        await checkAndAwardBadges(student._id);
      }
    }
    res.json({ success: true, message: `Request ${action}ed!` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/attendance', async (req, res) => {
  try {
    const { studentId, date, status } = req.body;
    if (!date) return res.status(400).json({ success: false, message: 'Date is required.' });

    const targetDate = new Date(date + 'T00:00:00');
    if (targetDate.getDay() === 0) {
      return res.status(400).json({ success: false, message: 'Error: Cannot mark attendance on a Sunday!' });
    }

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    student.attendance = student.attendance.filter(a => a.date !== date);
    student.attendance.push({ date, status });
    await student.save();
    await checkAndAwardBadges(studentId);
    res.json({ success: true, message: 'Attendance saved!' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/xp', async (req, res) => {
  try {
    const { studentId, xpAmount, action } = req.body;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    student.xp = action === 'add' ? student.xp + Number(xpAmount) : Math.max(0, student.xp - Number(xpAmount));
    await student.save();
    await checkAndAwardBadges(studentId);
    res.json({ success: true, message: 'XP updated!' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/admin/results', async (req, res) => {
  try {
    const results = await Result.find().populate('studentId', 'username studentIdTag').populate('testId', 'title');
    res.json({ success: true, results });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/grant-exam-xp', async (req, res) => {
  try {
    const { resultId, xpAmount } = req.body;
    const result = await Result.findById(resultId);
    if (!result) return res.status(404).json({ success: false, message: 'Result not found.' });

    const amount = Number(xpAmount) || 0;
    if (amount > 10) return res.status(400).json({ success: false, message: 'Max XP is 10.' });

    const student = await Student.findById(result.studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    student.xp += (amount - (result.grantedXpAmount || 0));
    await student.save();

    result.xpGranted = true;
    result.grantedXpAmount = amount;
    await result.save();
    await checkAndAwardBadges(student._id);

    res.json({ success: true, message: `Granted ${amount} XP successfully!` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
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
    res.json({ success: true, message: 'Exam reset.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/class', async (req, res) => {
  try {
    const { classroomId, title, meetLink } = req.body;
    await LiveClass.updateMany({ classroomId }, { isActive: false });
    await LiveClass.create({ classroomId, title, meetLink, isActive: true });
    res.json({ success: true, message: 'Live class published!' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/admin/classes', async (req, res) => {
  try {
    const classes = await LiveClass.find().populate('classroomId', 'name').sort({ createdAt: -1 });
    res.json({ success: true, classes });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/admin/class/:id', async (req, res) => {
  try {
    await LiveClass.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Class deleted.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/tests', async (req, res) => {
  try {
    const { classroomId, title, durationMinutes, durationHours, questions } = req.body;
    await Test.create({ classroomId, title, durationMinutes, durationHours: durationHours || 24, questions });
    res.json({ success: true, message: 'Test published!' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/admin/tests', async (req, res) => {
  try {
    const tests = await Test.find().populate('classroomId', 'name');
    res.json({ success: true, tests });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/admin/test/:id', async (req, res) => {
  try {
    await Test.findByIdAndDelete(req.params.id);
    await Result.deleteMany({ testId: req.params.id });
    res.json({ success: true, message: 'Test deleted.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/notes', async (req, res) => {
  try {
    const { classroomId, title, contentOrLink } = req.body;
    await Note.create({ classroomId, title, contentOrLink });
    res.json({ success: true, message: 'Note uploaded!' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/admin/notes', async (req, res) => {
  try {
    const notes = await Note.find().populate('classroomId', 'name').sort({ uploadedAt: -1 });
    res.json({ success: true, notes });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/admin/note/:id', async (req, res) => {
  try {
    await Note.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Note deleted.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
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
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/reports/download/:id', async (req, res) => {
  try {
    const report = await WeeklyReport.findById(req.params.id);
    if (!report) return res.status(404).send('Report not found.');
    let htmlOutput = report.reportType === 'master' ? await buildMasterReportHtml() : await buildStudentReportHtml(report.studentId);
    res.setHeader('Content-disposition', `attachment; filename=${report.reportType}-weekly-report.html`);
    res.setHeader('Content-type', 'text/html');
    res.send(htmlOutput);
  } catch (err) { res.status(500).send('Error downloading report.'); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "https://www.tutorpoint.page";
setInterval(() => {
  const protocol = RENDER_URL.startsWith('https') ? https : http;
  protocol.get(`${RENDER_URL}`, (res) => {}).on('error', (err) => {});
}, 10 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});