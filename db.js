const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  studentIdTag: { type: String, unique: true },
  role: { type: String, enum: ['student', 'admin'], default: 'student' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  strikeCount: { type: Number, default: 0 },
  isExamLocked: { type: Boolean, default: false },
  examStatus: { type: String, enum: ['not-started', 'submitted', 'terminated'], default: 'not-started' },
  attendance: [{ date: String, status: String }],
  xp: { type: Number, default: 0 }
});

const testSchema = new mongoose.Schema({
  title: { type: String, required: true },
  durationMinutes: { type: Number, default: 15 },
  questions: [{
    questionText: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctAnswer: { type: String, required: true }
  }],
  createdAt: { type: Date, default: Date.now }
});

const resultSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  score: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  timeTaken: { type: String, default: 'N/A' },
  submittedAt: { type: Date, default: Date.now }
});

const classSchema = new mongoose.Schema({
  meetLink: { type: String, required: true },
  title: { type: String, default: 'Live Class Session' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const attendanceRequestSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass' },
  classTitle: { type: String, required: true },
  date: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const reportSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.Mixed, required: true },
  reportType: { type: String, enum: ['student', 'admin'], required: true },
  monthYear: { type: String, required: true },
  reportData: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Student = mongoose.model('Student', studentSchema);
const Test = mongoose.model('Test', testSchema);
const Result = mongoose.model('Result', resultSchema);
const LiveClass = mongoose.model('LiveClass', classSchema);
const AttendanceRequest = mongoose.model('AttendanceRequest', attendanceRequestSchema);
const Report = mongoose.model('Report', reportSchema);

module.exports = { Student, Test, Result, LiveClass, AttendanceRequest, Report };