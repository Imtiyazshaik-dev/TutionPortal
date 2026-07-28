const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const { Student, Test, Result, LiveClass, AttendanceRequest, Report } = require('./models/db');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.DATABASE_URL;

const generateMonthlyReports = async () => {
  try {
    const now = new Date();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentMonthYear = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    const existingReports = await Report.findOne({ monthYear: currentMonthYear });
    if (existingReports) return;

    const students = await Student.find({ role: 'student' });
    const allResults = await Result.find().populate('studentId', 'username studentIdTag').populate('testId', 'title');

    let adminMasterData = [];

    for (let student of students) {
      const studentResults = allResults.filter(r => r.studentId && r.studentId._id.toString() === student._id.toString());
      
      const reportPayload = {
        username: student.username,
        studentIdTag: student.studentIdTag,
        totalXp: student.xp,
        attendanceHistory: student.attendance,
        testScores: studentResults.map(r => ({
          testTitle: r.testId ? r.testId.title : 'Assessment',
          score: r.score,
          total: r.totalQuestions,
          timeTaken: r.timeTaken,
          date: r.submittedAt
        }))
      };

      await Report.create({
        recipientId: student._id,
        reportType: 'student',
        monthYear: currentMonthYear,
        reportData: reportPayload
      });

      adminMasterData.push(reportPayload);
    }

    if (students.length > 0) {
      await Report.create({
        recipientId: 'admin',
        reportType: 'admin',
        monthYear: currentMonthYear,
        reportData: { masterRecords: adminMasterData }
      });
    }
  } catch (err) {
    console.error('Error generating monthly reports:', err);
  }
};

const assignIdsToPastStudents = async () => {
  try {
    const studentsWithoutId = await Student.find({ $or: [{ studentIdTag: { $exists: false } }, { studentIdTag: null }, { studentIdTag: "" }] });
    for (let student of studentsWithoutId) {
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      student.studentIdTag = `SID-${randomNum}`;
      await student.save();
    }
  } catch (err) {
    console.error('Error assigning IDs:', err);
  }
};

const createDefaultAdmin = async () => {
  try {
    const adminExists = await Student.findOne({ role: 'admin' });
    if (!adminExists) {
      await Student.create({
        username: 'admin',
        password: 'adminpassword123',
        studentIdTag: 'ADM-001',
        role: 'admin',
        status: 'approved'
      });
    }
  } catch (err) {
    console.error('Error creating admin:', err);
  }
};

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('MongoDB Connected Successfully via Mongoose!');
    await createDefaultAdmin();
    await assignIdsToPastStudents();
    await generateMonthlyReports();
    
    setInterval(() => {
      const today = new Date();
      if (today.getDate() === 1) {
        generateMonthlyReports();
      }
    }, 1000 * 60 * 60 * 24);

    app.listen(PORT, () => {
      console.log(`Server running smoothly on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

app.post('/api/auth', async (req, res) => {
  try {
    const { username, password } = req.body;
    const student = await Student.findOne({ username });

    if (!student) return res.status(404).json({ success: false, message: 'Username not found.' });
    if (student.password !== password) return res.status(401).json({ success: false, message: 'Incorrect password.' });
    if (student.status !== 'approved' && student.role !== 'admin') {
      return res.status(403).json({ success: false, message: `Account status: ${student.status}.` });
    }

    res.json({ success: true, message: 'Login successful', role: student.role, userId: student._id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/student/data/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if(!student) return res.status(404).json({ success: false, message: 'Student not found' });
    
    const leaderboard = await Student.find({ role: 'student', status: 'approved' }).sort({ xp: -1 }).limit(10).select('username xp');
    const activeClass = await LiveClass.findOne({ isActive: true }).sort({ createdAt: -1 });
    const submittedResults = await Result.find({ studentId: req.params.id }).select('testId score totalQuestions timeTaken submittedAt');
    const pendingReport = await Report.findOne({ recipientId: req.params.id, reportType: 'student' });

    res.json({ success: true, student, leaderboard, activeClass, submittedResults, hasReport: !!pendingReport, reportId: pendingReport ? pendingReport._id : null });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/reports-check', async (req, res) => {
  try {
    const pendingAdminReport = await Report.findOne({ recipientId: 'admin', reportType: 'admin' });
    res.json({ success: true, hasReport: !!pendingAdminReport, reportId: pendingAdminReport ? pendingAdminReport._id : null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reports/download/:reportId', async (req, res) => {
  try {
    const report = await Report.findById(req.params.reportId);
    if (!report) {
      return res.status(404).send('Report has already been downloaded and cleared from storage.');
    }

    const data = report.reportData;
    const isMaster = report.reportType === 'admin';
    const fileName = `${report.reportType}-monthly-report-${report.monthYear.replace(' ', '-')}.html`;

    let htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Performance Report - ${report.monthYear}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8fafc; color: #1e293b; padding: 40px; margin: 0; }
          .report-card { background: #ffffff; max-width: 700px; margin: 0 auto; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
          h1 { color: #0f172a; text-align: center; font-size: 24px; margin-bottom: 5px; }
          .subtitle { text-align: center; color: #64748b; font-size: 14px; margin-bottom: 30px; }
          h2 { color: #3b82f6; font-size: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 30px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
          th { background: #f1f5f9; color: #475569; font-weight: 600; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; }
          .badge-green { background: #dcfce7; color: #15803d; }
          .badge-red { background: #fee2e2; color: #b91c1c; }
          .print-btn { display: block; width: 100%; margin-top: 30px; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; text-align: center; text-decoration: none; }
          @media print { .print-btn { display: none; } body { background: white; padding: 0; } .report-card { box-shadow: none; border: none; } }
        </style>
      </head>
      <body>
        <div class="report-card">
          <h1>Tuition Portal Performance Report</h1>
          <div class="subtitle">Reporting Period: ${report.monthYear}</div>
    `;

    if (isMaster) {
      htmlContent += `<h2>Master Summary: All Students</h2>`;
      let records = data.masterRecords || [];
      if (records.length === 0) {
        htmlContent += `<p>No student performance records found for this period.</p>`;
      } else {
        records.forEach((rec, idx) => {
          htmlContent += `
            <div style="margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
              <strong>#${idx + 1} - ${rec.username}</strong> (ID: ${rec.studentIdTag})<br>
              <span style="color: #ec4899; font-weight: bold;">Total XP: ${rec.totalXp} XP</span> | 
              Attendance Logged: ${rec.attendanceHistory.length} | 
              Tests Taken: ${rec.testScores.length}
            </div>
          `;
        });
      }
    } else {
      htmlContent += `
        <p><strong>Student Name:</strong> ${data.username}</p>
        <p><strong>Student ID:</strong> ${data.studentIdTag}</p>
        <p><strong>Total XP Earned:</strong> <span style="color: #ec4899; font-weight: bold;">${data.totalXp} XP ⚡</span></p>
        <h2>Attendance History</h2>
      `;

      if (data.attendanceHistory.length === 0) {
        htmlContent += `<p style="color: #64748b;">No attendance history recorded for this month.</p>`;
      } else {
        htmlContent += `
          <table>
            <tr><th>Date</th><th>Status</th></tr>
        `;
        data.attendanceHistory.forEach(att => {
          let badgeClass = att.status === 'Present' ? 'badge-green' : 'badge-red';
          htmlContent += `<tr><td>${att.date}</td><td><span class="badge ${badgeClass}">${att.status}</span></td></tr>`;
        });
        htmlContent += `</table>`;
      }

      htmlContent += `<h2>Assessment Test Scores</h2>`;
      if (data.testScores.length === 0) {
        htmlContent += `<p style="color: #64748b;">No assessment tests taken during this period.</p>`;
      } else {
        htmlContent += `
          <table>
            <tr><th>Test Title</th><th>Score</th><th>Time Taken</th></tr>
        `;
        data.testScores.forEach(ts => {
          htmlContent += `<tr><td>${ts.testTitle}</td><td>${ts.score} / ${ts.total}</td><td>${ts.timeTaken}</td></tr>`;
        });
        htmlContent += `</table>`;
      }
    }

    htmlContent += `
          <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
        </div>
      </body>
      </html>
    `;

    res.setHeader('Content-disposition', `attachment; filename=${fileName}`);
    res.setHeader('Content-type', 'text/html');
    res.send(htmlContent);

    await Report.findByIdAndDelete(req.params.reportId);
  } catch (err) {
    res.status(500).send({ success: false, error: err.message });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    const student = await Student.findById(userId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    if (student.password !== oldPassword) return res.status(400).json({ success: false, message: 'Incorrect old password' });
    student.password = newPassword;
    await student.save();
    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/enroll', async (req, res) => {
  try {
    const { username, password, phone } = req.body;
    const existing = await Student.findOne({ username });
    if (existing) return res.status(400).json({ success: false, message: 'Username already exists' });

    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const studentIdTag = `SID-${randomNum}`;
    const newStudent = new Student({ username, password, studentIdTag, role: 'student', status: 'pending' });
    await newStudent.save();

    const message = encodeURIComponent(`Hey! You have been enrolled in the Tuition Portal. Your Student ID is: ${studentIdTag}, Username: ${username}, Password: ${password}. Log in here: http://localhost:3000/index.html`);
    const whatsappUrl = `https://wa.me/${phone}?text=${message}`;

    res.json({ success: true, message: 'Student enrolled with Pending status!', whatsappUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/students', async (req, res) => {
  try {
    const students = await Student.find({ role: 'student' });
    res.json({ success: true, students });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/student/:id', async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    await Result.deleteMany({ studentId: req.params.id }); 
    res.json({ success: true, message: 'Student account deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/student-status', async (req, res) => {
  try {
    const { studentId, status } = req.body;
    const student = await Student.findById(studentId);
    if(!student) return res.status(404).json({ success: false, message: 'Student not found' });
    student.status = status;
    await student.save();
    res.json({ success: true, message: `Student status successfully updated to ${status}` });
  } catch(err) {
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

app.get('/api/admin/classes', async (req, res) => {
  try {
    const classes = await LiveClass.find().sort({ createdAt: -1 });
    res.json({ success: true, classes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/class/:id', async (req, res) => {
  try {
    const { title, meetLink } = req.body;
    await LiveClass.findByIdAndUpdate(req.params.id, { title, meetLink });
    res.json({ success: true, message: 'Class updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/class/:id', async (req, res) => {
  try {
    await LiveClass.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Class deleted successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/class', async (req, res) => {
  try {
    const { meetLink, title } = req.body;
    await LiveClass.updateMany({}, { isActive: false });
    const newClass = new LiveClass({ meetLink, title, isActive: true });
    await newClass.save();
    res.json({ success: true, message: 'Live class link posted successfully!' });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/attendance', async (req, res) => {
  try {
    const { studentId, date, status } = req.body;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    student.attendance.push({ date, status });
    await student.save();
    res.json({ success: true, message: 'Attendance marked successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/student/join-class', async (req, res) => {
  try {
    const { userId, classId, classTitle } = req.body;
    const student = await Student.findById(userId);
    if(!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const today = new Date().toISOString().split('T')[0];
    const existingReq = await AttendanceRequest.findOne({ studentId: userId, date: today, status: 'pending' });
    const alreadyMarked = student.attendance.some(att => att.date === today);

    if (!alreadyMarked && !existingReq) {
      await AttendanceRequest.create({
        studentId: userId,
        classId: classId || null,
        classTitle: classTitle || 'Live Class Session',
        date: today,
        status: 'pending'
      });
    }

    res.json({ success: true, message: 'Attendance request submitted to admin for approval!' });
  } catch(err) {
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
    if(!reqDoc) return res.status(404).json({ success: false, message: 'Request not found' });

    if(action === 'approve') {
      const student = await Student.findById(reqDoc.studentId);
      if(student) {
        const alreadyMarked = student.attendance.some(att => att.date === reqDoc.date);
        if(!alreadyMarked) {
          student.attendance.push({ date: reqDoc.date, status: 'Present' });
          await student.save();
        }
      }
      reqDoc.status = 'approved';
    } else {
      reqDoc.status = 'rejected';
    }

    await reqDoc.save();
    res.json({ success: true, message: `Attendance request ${action}d successfully!` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/xp', async (req, res) => {
  try {
    const { studentId, xpAmount, action } = req.body;
    const student = await Student.findById(studentId);
    if(!student) return res.status(404).json({ success: false, message: 'Student not found' });
    
    const amount = Number(xpAmount);
    if (action === 'deduct') {
      student.xp = Math.max(0, student.xp - amount);
      await student.save();
      res.json({ success: true, message: `Successfully deducted ${amount} XP from ${student.username}` });
    } else {
      student.xp += amount;
      await student.save();
      res.json({ success: true, message: `Successfully awarded ${amount} XP to ${student.username}` });
    }
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/tests', async (req, res) => {
  try {
    const { title, durationMinutes, questions } = req.body;
    const newTest = new Test({ title, durationMinutes: durationMinutes || 15, questions });
    await newTest.save();
    res.json({ success: true, message: 'Test created successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/test/:id', async (req, res) => {
  try {
    const { title } = req.body;
    await Test.findByIdAndUpdate(req.params.id, { title });
    res.json({ success: true, message: 'Test title updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/test/:id', async (req, res) => {
  try {
    await Test.findByIdAndDelete(req.params.id);
    await Result.deleteMany({ testId: req.params.id });
    res.json({ success: true, message: 'Test deleted successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/tests', async (req, res) => {
  try {
    const tests = await Test.find().sort({ createdAt: -1 });
    res.json({ success: true, tests });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/tests/:id', async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ success: false, message: 'Test not found' });
    res.json({ success: true, test });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/exam/strike', async (req, res) => {
  try {
    const { userId } = req.body;
    const student = await Student.findById(userId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    student.strikeCount += 1;
    if (student.strikeCount >= 2) {
      student.isExamLocked = true;
      student.examStatus = 'terminated';
      await student.save();
      return res.json({ success: true, terminated: true, message: 'Exam terminated due to multiple app switches / tab changes.' });
    }
    await student.save();
    res.json({ success: true, terminated: false, strikeCount: student.strikeCount, message: 'Warning: App/tab switching detected. One more violation will terminate your test.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/exam/submit', async (req, res) => {
  try {
    const { userId, testId, answers, timeTaken } = req.body;
    const existingResult = await Result.findOne({ studentId: userId, testId: testId });
    if(existingResult) {
      return res.status(400).json({ success: false, message: 'You have already attempted and submitted this test.' });
    }

    const student = await Student.findById(userId);
    const test = await Test.findById(testId);
    if (!student || !test) return res.status(404).json({ success: false, message: 'Student or Test not found' });

    let score = 0;
    test.questions.forEach((q, index) => {
      if (answers[index] === q.correctAnswer) score += 1;
    });

    await Result.create({ 
      studentId: userId, 
      testId: testId, 
      score: score, 
      totalQuestions: test.questions.length,
      timeTaken: timeTaken || 'N/A'
    });

    student.xp += (score * 10);
    student.examStatus = 'submitted';
    student.isExamLocked = true;
    await student.save();

    res.json({ success: true, message: `Exam submitted successfully! Score: ${score}/${test.questions.length}. Time taken: ${timeTaken}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/reset-exam', async (req, res) => {
  try {
    const { studentId, testId } = req.body;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    student.strikeCount = 0;
    student.isExamLocked = false;
    student.examStatus = 'not-started';
    await student.save();
    if (testId) {
      await Result.findOneAndDelete({ studentId, testId });
    } else {
      await Result.deleteMany({ studentId });
    }
    res.json({ success: true, message: `Exam successfully reset for student.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});