const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbRun } = require('../db/database');
const fs = require('fs');
const path = require('path');

let StudentModel = null;
try {
  StudentModel = require('../models/Student');
} catch (e) {}

// GET /api/students - List all students or filter by branch/semester/search
router.get('/', async (req, res) => {
  try {
    const { branch, department, semester, search } = req.query;
    const targetBranch = branch || department;

    if (process.env.MONGODB_URI) {
      const query = {};
      if (targetBranch && targetBranch !== 'All') {
        query.branch = targetBranch;
      }
      if (semester && semester !== 'All') {
        query.semester = semester;
      }
      if (search) {
        query.$or = [
          { name: new RegExp(search, 'i') },
          { rollNumber: new RegExp(search, 'i') },
          { registrationNumber: new RegExp(search, 'i') },
          { studentId: new RegExp(search, 'i') }
        ];
      }
      const students = await StudentModel.find(query).sort({ createdAt: -1 });
      return res.json({ success: true, count: students.length, students });
    }

    // SQLite Fallback
    let sql = 'SELECT * FROM students WHERE 1=1';
    let params = [];

    if (targetBranch && targetBranch !== 'All') {
      sql += ' AND (branch = ? OR department = ?)';
      params.push(targetBranch, targetBranch);
    }

    if (semester && semester !== 'All') {
      sql += ' AND semester = ?';
      params.push(semester);
    }

    if (search) {
      sql += ' AND (name LIKE ? OR student_id LIKE ? OR roll_number LIKE ? OR registration_number LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY id DESC';
    const students = await dbQuery(sql, params);
    
    // Normalize fields for frontend
    const normalized = students.map(s => ({
      ...s,
      rollNumber: s.roll_number || s.rollNumber,
      registrationNumber: s.registration_number || s.registrationNumber,
      branch: s.branch || s.department,
      studentId: s.student_id || s.studentId,
      photoPath: s.photo_path || s.photoPath || ''
    }));

    res.json({ success: true, count: normalized.length, students: normalized });
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ success: false, message: 'Database error fetching students' });
  }
});

// GET /api/students/:student_id - Get single student profile
router.get('/:student_id', async (req, res) => {
  try {
    const studentId = req.params.student_id;

    if (process.env.MONGODB_URI) {
      const student = await StudentModel.findOne({
        $or: [{ studentId }, { rollNumber: studentId }]
      });
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
      return res.json({ success: true, student, face_samples: student.descriptors ? student.descriptors.length : 0 });
    }

    const student = await dbGet('SELECT * FROM students WHERE student_id = ? OR roll_number = ?', [studentId, studentId]);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    const embeddings = await dbQuery('SELECT id, created_at, image_path FROM face_embeddings WHERE student_id = ?', [student.student_id]);
    
    const normalized = {
      ...student,
      rollNumber: student.roll_number,
      registrationNumber: student.registration_number,
      branch: student.branch || student.department,
      studentId: student.student_id,
      photoPath: student.photo_path
    };

    res.json({ success: true, student: normalized, face_samples: embeddings.length, embeddings });
  } catch (err) {
    console.error('Error retrieving student:', err);
    res.status(500).json({ success: false, message: 'Error retrieving student profile' });
  }
});

// POST /api/students - Add new student with complete details
router.post('/', async (req, res) => {
  try {
    const { 
      name, 
      rollNumber, roll_number,
      registrationNumber, registration_number,
      branch, department,
      semester, 
      section, 
      mobile, phone,
      email, 
      address,
      parentName, parent_name,
      parentMobile, parent_mobile,
      parentWhatsapp, parent_whatsapp,
      parentEmail, parent_email,
      emergencyContact, emergency_contact
    } = req.body;

    const rNum = rollNumber || roll_number;
    const regNum = registrationNumber || registration_number;
    const bName = branch || department;
    const mobNum = mobile || phone;
    const pName = parentName || parent_name || '';
    const pMob = parentMobile || parent_mobile || mobNum || '';
    const pWhatsapp = parentWhatsapp || parent_whatsapp || pMob || '';
    const pEmail = parentEmail || parent_email || email || '';
    const eContact = emergencyContact || emergency_contact || pMob || '';
    const sId = req.body.studentId || req.body.student_id || `STU-${rNum || Date.now()}`;

    if (!name || !rNum || !bName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Student Name, Roll Number, and Branch are required fields.' 
      });
    }

    if (process.env.MONGODB_URI) {
      const existing = await StudentModel.findOne({
        $or: [{ rollNumber: rNum }, { registrationNumber: regNum }, { studentId: sId }]
      });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Student with this Roll Number or Registration Number already exists.' });
      }

      const newStudent = await StudentModel.create({
        studentId: sId,
        name,
        rollNumber: rNum,
        registrationNumber: regNum || `REG-${rNum}`,
        branch: bName,
        semester: semester || 'Semester 1',
        section: section || 'A',
        mobile: mobNum || '',
        email: email || '',
        address: address || '',
        parentName: pName,
        parentMobile: pMob,
        parentWhatsapp: pWhatsapp,
        parentEmail: pEmail,
        emergencyContact: eContact
      });

      return res.status(201).json({
        success: true,
        message: 'Student registered successfully!',
        student: newStudent
      });
    }

    // SQLite Fallback
    const existing = await dbGet('SELECT id FROM students WHERE student_id = ? OR roll_number = ?', [sId, rNum]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Student ID or Roll Number already exists.' });
    }

    const result = await dbRun(
      `INSERT INTO students (student_id, name, roll_number, registration_number, branch, department, semester, section, mobile, phone, email, address, parent_name, parent_mobile, parent_whatsapp, parent_email, emergency_contact, face_enrolled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [sId, name, rNum, regNum || `REG-${rNum}`, bName, bName, semester || 'Semester 1', section || 'A', mobNum || '', mobNum || '', email || '', address || '', pName, pMob, pWhatsapp, pEmail, eContact]
    );

    res.status(201).json({
      success: true,
      message: 'Student registered successfully!',
      student: { id: result.id, student_id: sId, studentId: sId, name, roll_number: rNum, rollNumber: rNum, branch: bName, parent_name: pName }
    });
  } catch (err) {
    console.error('Error adding student:', err);
    res.status(500).json({ success: false, message: 'Server error while adding student' });
  }
});

// PUT /api/students/:student_id - Update student information
router.put('/:student_id', async (req, res) => {
  try {
    const studentId = req.params.student_id;
    const { 
      name, 
      rollNumber, roll_number, 
      registrationNumber, registration_number, 
      branch, department, 
      semester, 
      section, 
      mobile, phone, 
      email, 
      address 
    } = req.body;

    const rNum = rollNumber || roll_number;
    const regNum = registrationNumber || registration_number;
    const bName = branch || department;
    const mobNum = mobile || phone;

    if (process.env.MONGODB_URI) {
      const student = await StudentModel.findOneAndUpdate(
        { $or: [{ studentId }, { rollNumber: studentId }] },
        {
          name,
          rollNumber: rNum,
          registrationNumber: regNum,
          branch: bName,
          semester,
          section,
          mobile: mobNum,
          email,
          address
        },
        { new: true }
      );
      if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
      return res.json({ success: true, message: 'Student details updated successfully', student });
    }

    const existing = await dbGet('SELECT id FROM students WHERE student_id = ? OR roll_number = ?', [studentId, studentId]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    await dbRun(
      `UPDATE students SET name = ?, roll_number = ?, registration_number = ?, branch = ?, department = ?, semester = ?, section = ?, mobile = ?, phone = ?, email = ?, address = ? WHERE id = ?`,
      [name, rNum, regNum, bName, bName, semester, section, mobNum, mobNum, email, address, existing.id]
    );

    res.json({ success: true, message: 'Student details updated successfully' });
  } catch (err) {
    console.error('Update student error:', err);
    res.status(500).json({ success: false, message: 'Failed to update student details' });
  }
});

// DELETE /api/students/:student_id - Delete student and their facial data
router.delete('/:student_id', async (req, res) => {
  try {
    const studentId = req.params.student_id;

    if (process.env.MONGODB_URI) {
      await StudentModel.deleteOne({ $or: [{ studentId }, { rollNumber: studentId }] });
      return res.json({ success: true, message: 'Student deleted successfully' });
    }

    const student = await dbGet('SELECT * FROM students WHERE student_id = ? OR roll_number = ?', [studentId, studentId]);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Delete photo directory if exists
    const studentFolder = path.join(__dirname, '..', 'uploads', 'faces', student.student_id);
    if (fs.existsSync(studentFolder)) {
      fs.rmSync(studentFolder, { recursive: true, force: true });
    }

    await dbRun('DELETE FROM students WHERE id = ?', [student.id]);
    await dbRun('DELETE FROM face_embeddings WHERE student_id = ?', [student.student_id]);
    await dbRun('DELETE FROM attendance WHERE student_id = ?', [student.student_id]);

    res.json({ success: true, message: `Student ${student.name} deleted successfully` });
  } catch (err) {
    console.error('Delete student error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete student' });
  }
});

module.exports = router;
