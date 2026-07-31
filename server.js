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
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
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
  strikes: { type: Number, default: 0 }
});

const testSchema = new mongoose.Schema({
  classroomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
  title: { type: String, required: true },
  durationMinutes: { type: Number, default: 15 },
  startTime: { type: Date },
  endTime: { type: Date },
  questions: [{
    questionText: String,
    options: [String],
    correctAnswer: String
  }]
});

const resultSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  score: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  timeTaken: { type: String },
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

// Seed Default Master Admin
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

// --- WEEKLY SUNDAY REPORT GENERATOR ---
async function generateWeeklyReports() {
  try {
    const students = await Student.find({ role: 'student', status: 'approved' });
    let masterContent = "--- WEEKLY PERFORMANCE MASTER REPORT ---\nGenerated on: " + new Date().toLocaleString() + "\n\n";

    for (const student of students) {
      const results = await Result.find({ studentId: student._id }).populate('testId', 'title');
      let studentText = `Student: ${student.username} (ID: ${student.studentIdTag || 'N/A'})\nTotal XP: ${student.xp}\nAttendance Count: ${student.attendance.length}\nTest Scores:\n`;
      
      results.forEach(r => {
        const testTitle = r.testId ? r.testId.title : 'Test';
        studentText += ` - ${testTitle}: ${r.score}/${r.totalQuestions}\n`;
      });
      studentText += "----------------------------------------\n";
      masterContent += studentText;

      const individualContent = `--- YOUR WEEKLY PERFORMANCE REPORT ---\nStudent: ${student.username}\nStudent ID: ${student.studentIdTag || 'N/A'}\nTotal XP: ${student.xp}\nAttendance Count: ${student.attendance.length}\n\nYour Test Scores:\n` + 
        results.map(r => ` - ${r.testId ? r.testId.title : 'Test'}: ${r.score}/${r.totalQuestions}`).join('\n') + 
        `\n\nKeep up the great work!`;

      await WeeklyReport.deleteMany({ studentId: student._id, reportType: 'student' });
      await WeeklyReport.create({ reportType: 'student', studentId: student._id, content: individualContent });
    }

    await WeeklyReport.deleteMany({ reportType: 'master' });
    await WeeklyReport.create({ reportType: 'master', content: masterContent });
    console.log("Weekly Sunday Master and Student Reports generated successfully!");
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

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await Student.findOne({ username, password });
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    if (user.role === 'student' && user.status !== 'approved') {
      return res.status(403).json({ success: false, message: `Your account status is currently ${user.status}. Please wait for admin approval.` });
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
    if (!user || user.password !== oldPassword) {
      return res.status(400).json({ success: false, message: 'Incorrect old password.' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- CLASSROOMS API ---
app.get('/api/classrooms/:adminId', async (req, res) => {
  try {
    const adminUser = await Student.findById(req.params.adminId);
    if (!adminUser) return res.status(404).json({ success: false, message: 'Admin not found.' });

    let classrooms;
    if (adminUser.username === 'admin') {
      classrooms = await Classroom.find().populate('createdBy', 'username').sort({ createdAt: -1 });
    } else {
      classrooms = await Classroom.find({ createdBy: adminUser._id }).populate('createdBy', 'username').sort({ createdAt: -1 });
    }

    res.json({ success: true, classrooms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/classrooms', async (req, res) => {
  try {
    const { name, description, adminId } = req.body;
    if (!adminId) return res.status(400).json({ success: false, message: 'Admin ID required.' });

    await Classroom.create({ name, description, createdBy: adminId });
    res.json({ success: true, message: 'Classroom cohort created successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- STUDENT DASHBOARD ROUTES ---
app.get('/api/student/classroom-data/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    if (!student.classroomId) {
      return res.json({ success: true, assigned: false, student });
    }

    const classroom = await Classroom.findById(student.classroomId);
    const leaderboard = await Student.find({ classroomId: student.classroomId, status: 'approved' })
      .sort({ xp: -1 })
      .select('username xp studentIdTag');

    const allTests = await Test.find({ classroomId: student.classroomId }).sort({ _id: -1 });
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const filteredTests = allTests.filter(test => {
      const testCreationDate = test._id.getTimestamp();
      return testCreationDate >= oneWeekAgo;
    }).slice(0, 7);

    const availableTests = filteredTests.map(test => {
      let isUnlocked = true;
      let statusMessage = "Available";

      if (test.startTime && new Date(test.startTime) > now) {
        isUnlocked = false;
        statusMessage = `Unlocks at: ${new Date(test.startTime).toLocaleString()}`;
      } else if (test.endTime && new Date(test.endTime) < now) {
        isUnlocked = false;
        statusMessage = `Locked (Ended at: ${new Date(test.endTime).toLocaleString()})`;
      }

      return {
        _id: test._id,
        title: test.title,
        durationMinutes: test.durationMinutes,
        isUnlocked,
        statusMessage
      };
    });

    const notes = await Note.find({ classroomId: student.classroomId }).sort({ uploadedAt: -1 });
    const activeClass = await LiveClass.findOne({ classroomId: student.classroomId, isActive: true });
    const submittedResults = await Result.find({ studentId: student._id });
    const report = await WeeklyReport.findOne({ studentId: student._id, reportType: 'student' });

    res.json({
      success: true,
      assigned: true,
      classroom,
      student,
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
      await AttendanceRequest.create({
        studentId: userId,
        classId,
        classTitle: classTitle || 'Live Class Session',
        date: today
      });
    }

    res.json({ success: true, message: 'Attendance request sent!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- ASSESSMENT & EXAM ROUTES ---
app.get('/api/tests/:id', async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ success: false, message: 'Test not found.' });

    const now = new Date();
    if ((test.startTime && new Date(test.startTime) > now) || (test.endTime && new Date(test.endTime) < now)) {
      return res.status(403).json({ success: false, message: 'This test is currently locked outside its scheduled window.' });
    }

    res.json({ success: true, test });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/exam/submit', async (req, res) => {
  try {
    const { userId, testId, answers, timeTaken } = req.body;
    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ success: false, message: 'Test not found.' });

    let score = 0;
    test.questions.forEach((q, idx) => {
      if (answers[idx] === q.correctAnswer) {
        score++;
      }
    });

    await Result.create({
      studentId: userId,
      testId,
      score,
      totalQuestions: test.questions.length,
      timeTaken
    });

    const student = await Student.findById(userId);
    if (student) {
      student.xp += score * 10;
      await student.save();
    }

    res.json({ success: true, message: `Exam submitted! Score: ${score}/${test.questions.length}` });
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

    if (student.strikes >= 3) {
      return res.json({ success: true, terminated: true, message: 'Maximum tab-switch violations reached! Exam auto-submitted.' });
    }

    res.json({ success: true, terminated: false, message: `Warning! Tab-switch detected. Strike ${student.strikes}/3.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- ADMIN COMMAND CENTER ROUTES ---
app.get('/api/admin/students', async (req, res) => {
  try {
    const students = await Student.find({ role: 'student' }).populate('classroomId', 'name');
    res.json({ success: true, students });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/pending-students/:adminId', async (req, res) => {
  try {
    const adminUser = await Student.findById(req.params.adminId);
    if (!adminUser || adminUser.username !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Master admin only.' });
    }

    const pendingStudents = await Student.find({ role: 'student', status: 'pending' }).sort({ _id: 1 }).populate('classroomId', 'name');
    res.json({ success: true, students: pendingStudents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/approved-students/:adminId', async (req, res) => {
  try {
    const adminUser = await Student.findById(req.params.adminId);
    if (!adminUser) return res.status(404).json({ success: false, message: 'Admin not found.' });

    let approvedStudents;
    if (adminUser.username === 'admin') {
      approvedStudents = await Student.find({ role: 'student', status: 'approved' }).populate('classroomId', 'name');
    } else {
      const teacherClassrooms = await Classroom.find({ createdBy: adminUser._id }).select('_id');
      const classroomIds = teacherClassrooms.map(c => c._id);
      approvedStudents = await Student.find({ role: 'student', status: 'approved', classroomId: { $in: classroomIds } }).populate('classroomId', 'name');
    }

    res.json({ success: true, students: approvedStudents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/enroll', async (req, res) => {
  try {
    const { username, password, phone, classroomId, adminId } = req.body;
    
    if (!username || !password || !classroomId) {
      return res.status(400).json({ success: false, message: 'Username, password, and classroom are required.' });
    }

    const adminUser = await Student.findById(adminId);
    if (!adminUser) return res.status(404).json({ success: false, message: 'Admin not found.' });

    if (adminUser.username !== 'admin') {
      const cohort = await Classroom.findOne({ _id: classroomId, createdBy: adminUser._id });
      if (!cohort) {
        return res.status(403).json({ success: false, message: 'You can only enroll students into your own cohorts.' });
      }
    }

    const existing = await Student.findOne({ username });
    if (existing) return res.status(400).json({ success: false, message: 'Username already exists' });

    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const studentIdTag = `STU-${Date.now().toString().slice(-4)}${randomSuffix}`;
    const portalUrl = "https://www.tutorpoint.page";

    const studentData = {
      username: username.trim(),
      password: password,
      role: 'student',
      status: 'pending',
      studentIdTag: studentIdTag,
      classroomId: classroomId,
      xp: 0,
      strikes: 0
    };

    const newStudent = await Student.create(studentData);
    console.log("Successfully saved student ID in DB:", newStudent._id);

    let whatsappUrl = '';
    if (phone && phone.trim() !== '') {
      const message = encodeURIComponent(`Hey! You have been enrolled in the Tuition Portal.\n\nPortal: ${portalUrl}\nUsername: ${username}\nPassword: ${password}`);
      whatsappUrl = `https://wa.me/${phone}?text=${message}`;
    }

    res.json({ 
      success: true, 
      message: 'Student enrolled successfully and sent to Master Admin approval queue!', 
      whatsappUrl: whatsappUrl 
    });
  } catch (err) {
    console.error("CRITICAL ENROLLMENT ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/student-status', async (req, res) => {
  try {
    const { studentId, status, adminId } = req.body;
    const adminUser = await Student.findById(adminId);
    
    if (!adminUser || adminUser.username !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Only Master Admin can approve or reject students.' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

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
    res.json({ success: true, message: 'Student account and records deleted.' });
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

    if (action === 'approve') {
      reqDoc.status = 'approved';
      await reqDoc.save();

      const student = await Student.findById(reqDoc.studentId);
      if (student) {
        student.attendance.push({ date: reqDoc.date, status: 'Present' });
        await student.save();
      }
      res.json({ success: true, message: 'Attendance approved and marked!' });
    } else {
      reqDoc.status = 'rejected';
      await reqDoc.save();
      res.json({ success: true, message: 'Attendance request rejected.' });
    }
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

    const amount = Number(xpAmount);
    if (action === 'add') {
      student.xp += amount;
    } else {
      student.xp = Math.max(0, student.xp - amount);
    }
    await student.save();

    res.json({ success: true, message: `Student XP updated successfully!` });
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

app.post('/api/admin/reset-exam', async (req, res) => {
  try {
    const { studentId, testId } = req.body;
    await Result.findOneAndDelete({ studentId, testId });
    res.json({ success: true, message: 'Exam submission reset. Student can retake the test.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- CLASSROOM ASSETS: LIVE CLASSES, TESTS, NOTES ---
app.post('/api/admin/class', async (req, res) => {
  try {
    const { classroomId, title, meetLink, adminId } = req.body;
    const adminUser = await Student.findById(adminId);
    if (!adminUser) return res.status(404).json({ success: false, message: 'Admin not found.' });

    if (adminUser.username !== 'admin') {
      const cohort = await Classroom.findOne({ _id: classroomId, createdBy: adminUser._id });
      if (!cohort) return res.status(403).json({ success: false, message: 'Access denied. You can only manage your own cohorts.' });
    }

    await LiveClass.updateMany({ classroomId }, { isActive: false });
    await LiveClass.create({ classroomId, title, meetLink, isActive: true });
    res.json({ success: true, message: 'Live class published for cohort!' });
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
    const { classroomId, title, durationMinutes, startTime, endTime, questions, adminId } = req.body;
    const adminUser = await Student.findById(adminId);
    if (!adminUser) return res.status(404).json({ success: false, message: 'Admin not found.' });

    if (adminUser.username !== 'admin') {
      const cohort = await Classroom.findOne({ _id: classroomId, createdBy: adminUser._id });
      if (!cohort) return res.status(403).json({ success: false, message: 'Access denied. You can only create tests for your own cohorts.' });
    }

    await Test.create({ classroomId, title, durationMinutes, startTime, endTime, questions });
    res.json({ success: true, message: 'Cohort assessment test published with schedule window!' });
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
    const { classroomId, title, contentOrLink, adminId } = req.body;
    const adminUser = await Student.findById(adminId);
    if (!adminUser) return res.status(404).json({ success: false, message: 'Admin not found.' });

    if (adminUser.username !== 'admin') {
      const cohort = await Classroom.findOne({ _id: classroomId, createdBy: adminUser._id });
      if (!cohort) return res.status(403).json({ success: false, message: 'Access denied. You can only upload notes to your own cohorts.' });
    }

    await Note.create({ classroomId, title, contentOrLink });
    res.json({ success: true, message: 'Study note uploaded to classroom repository!' });
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
    const report = await WeeklyReport.findOne({ reportType: 'master' });
    res.json({ success: true, hasReport: !!report, reportId: report ? report._id : null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reports/download/:id', async (req, res) => {
  try {
    const report = await WeeklyReport.findById(req.params.id);
    if (!report) return res.status(404).send('Report not found.');

    res.setHeader('Content-disposition', `attachment; filename=${report.reportType}-weekly-report.txt`);
    res.setHeader('Content-type', 'text/plain');
    res.send(report.content);
  } catch (err) {
    res.status(500).send('Error downloading report.');
  }
});

// Fallback SPA Route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- SELF-PING KEEP-ALIVE MECHANISM ---
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