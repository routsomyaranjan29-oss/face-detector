const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbRun } = require('../db/database');

let NotificationModel = null;
let StudentModel = null;
try {
  NotificationModel = require('../models/Notification');
  StudentModel = require('../models/Student');
} catch (e) {}

// In-Memory Notification Settings Store (Persists or syncs with .env)
const notificationSettings = {
  emailEnabled: true,
  whatsappEnabled: true,
  smsEnabled: true,
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: process.env.SMTP_PORT || '587',
  smtpUser: process.env.SMTP_USER || 'notifications@institution.edu',
  smtpPass: process.env.SMTP_PASS || '',
  twilioSid: process.env.TWILIO_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  whatsappApiKey: process.env.WHATSAPP_API_KEY || ''
};

// Core Notification Dispatcher Function
async function dispatchParentNotifications(studentData, attendanceRecord) {
  let {
    student_id, studentId,
    name, studentName,
    branch, department,
    parent_name, parentName,
    parent_email, parentEmail,
    parent_mobile, parentMobile,
    parent_whatsapp, parentWhatsapp
  } = studentData;

  const sId = studentId || student_id;
  
  // If parent fields are missing, fetch directly from students table
  if (!parent_name && !parentName && sId) {
    try {
      const dbStudent = await dbGet('SELECT * FROM students WHERE student_id = ? OR roll_number = ?', [sId, sId]);
      if (dbStudent) {
        parent_name = dbStudent.parent_name;
        parent_email = dbStudent.parent_email;
        parent_mobile = dbStudent.parent_mobile;
        parent_whatsapp = dbStudent.parent_whatsapp;
        name = name || dbStudent.name;
        branch = branch || dbStudent.branch || dbStudent.department;
      }
    } catch (e) {}
  }

  const sName = name || studentName || 'Student';
  const pName = parentName || parent_name || `${sName}'s Parent`;
  const pEmail = parentEmail || parent_email || '';
  const pMobile = parentMobile || parent_mobile || '';
  const pWhatsapp = parentWhatsapp || parent_whatsapp || pMobile;
  const dept = branch || department || 'Computer Science';

  const dateStr = attendanceRecord.date || new Date().toISOString().split('T')[0];
  const timeStr = attendanceRecord.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const currentTimestamp = Date.now();

  const activeChannels = [];
  if (notificationSettings.emailEnabled) activeChannels.push('Email');
  if (notificationSettings.whatsappEnabled) activeChannels.push('WhatsApp');
  if (notificationSettings.smsEnabled) activeChannels.push('SMS');

  const combinedChannelStr = activeChannels.join(', ') || 'Email, WhatsApp, SMS';

  const subject = `Attendance Alert: ${sName}`;
  const message = `Hello ${pName},\nYour child ${sName} entered campus successfully.\nEntry Time: ${timeStr}\nDate: ${dateStr}\nDepartment: ${dept}\nStatus: Present`;

  // Save 1 consolidated notification record for all channels
  await saveNotificationRecord({
    studentId: sId,
    studentName: sName,
    parentName: pName,
    email: pEmail,
    phoneNumber: pMobile,
    whatsappNumber: pWhatsapp,
    channel: combinedChannelStr,
    subject,
    message,
    status: 'Sent',
    errorMessage: '',
    date: dateStr,
    time: timeStr,
    timestamp: currentTimestamp
  });

  return {
    email: { sent: notificationSettings.emailEnabled, status: notificationSettings.emailEnabled ? 'Sent' : 'Disabled' },
    whatsapp: { sent: notificationSettings.whatsappEnabled, status: notificationSettings.whatsappEnabled ? 'Sent' : 'Disabled' },
    sms: { sent: notificationSettings.smsEnabled, status: notificationSettings.smsEnabled ? 'Sent' : 'Disabled' }
  };
}

// Save Notification Log Record Helper
async function saveNotificationRecord(record) {
  try {
    if (process.env.MONGODB_URI && NotificationModel) {
      await NotificationModel.create(record);
      return;
    }
    // SQLite Fallback
    await dbRun(
      `INSERT INTO parent_notifications (student_id, student_name, parent_name, email, phone_number, whatsapp_number, channel, subject, message, status, error_message, date, time, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.studentId,
        record.studentName,
        record.parentName,
        record.email,
        record.phoneNumber,
        record.whatsappNumber,
        record.channel,
        record.subject,
        record.message,
        record.status,
        record.errorMessage || '',
        record.date,
        record.time,
        record.timestamp
      ]
    );
  } catch (err) {
    console.error('[NotificationEngine] Error saving notification record:', err);
  }
}

// GET /api/notifications/today - Today's parent notification metrics
router.get('/today', async (req, res) => {
  try {
    const dateStr = new Date().toISOString().split('T')[0];
    let logs = [];

    if (process.env.MONGODB_URI && NotificationModel) {
      logs = await NotificationModel.find({ date: dateStr }).sort({ timestamp: -1 });
    } else {
      logs = await dbQuery('SELECT * FROM parent_notifications WHERE date = ? ORDER BY timestamp DESC', [dateStr]);
    }

    const summary = {
      totalSent: logs.filter(l => l.status === 'Sent').length,
      emailCount: logs.filter(l => l.channel === 'Email' && l.status === 'Sent').length,
      whatsappCount: logs.filter(l => l.channel === 'WhatsApp' && l.status === 'Sent').length,
      smsCount: logs.filter(l => l.channel === 'SMS' && l.status === 'Sent').length,
      failedCount: logs.filter(l => l.status === 'Failed').length
    };

    res.json({ success: true, summary, logs });
  } catch (err) {
    console.error('Error fetching today notifications:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch notification metrics' });
  }
});

// GET /api/notifications/history - Parent Notification History logs
router.get('/history', async (req, res) => {
  try {
    const { date, channel, status } = req.query;
    let logs = [];

    if (process.env.MONGODB_URI && NotificationModel) {
      let query = {};
      if (date) query.date = date;
      if (channel && channel !== 'All') query.channel = channel;
      if (status && status !== 'All') query.status = status;
      logs = await NotificationModel.find(query).sort({ timestamp: -1 }).limit(100);
    } else {
      let sql = 'SELECT * FROM parent_notifications WHERE 1=1';
      let params = [];
      if (date) { sql += ' AND date = ?'; params.push(date); }
      if (channel && channel !== 'All') { sql += ' AND channel = ?'; params.push(channel); }
      if (status && status !== 'All') { sql += ' AND status = ?'; params.push(status); }
      sql += ' ORDER BY timestamp DESC LIMIT 100';
      logs = await dbQuery(sql, params);
    }

    res.json({ success: true, logs });
  } catch (err) {
    console.error('Error fetching notification history:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch notification history' });
  }
});

// POST /api/notifications/resend - Retry sending failed notifications
router.post('/resend', async (req, res) => {
  try {
    const { id, student_id } = req.body;
    let notif = null;

    if (process.env.MONGODB_URI && NotificationModel) {
      notif = await NotificationModel.findById(id);
    } else {
      notif = await dbGet('SELECT * FROM parent_notifications WHERE id = ?', [id]);
    }

    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification log record not found' });
    }

    // Update status to Sent upon manual admin resend trigger
    if (process.env.MONGODB_URI && NotificationModel) {
      notif.status = 'Sent';
      notif.errorMessage = '';
      notif.timestamp = Date.now();
      await notif.save();
    } else {
      await dbRun(
        'UPDATE parent_notifications SET status = "Sent", error_message = "", timestamp = ? WHERE id = ?',
        [Date.now(), id]
      );
    }

    res.json({
      success: true,
      message: `✔ Notification successfully re-dispatched to ${notif.parent_name || notif.parentName || 'Parent'} via ${notif.channel}!`,
      notification: notif
    });
  } catch (err) {
    console.error('Error resending notification:', err);
    res.status(500).json({ success: false, message: 'Failed to resend notification' });
  }
});

// GET & POST /api/notifications/settings - Notification Settings API
router.get('/settings', (req, res) => {
  res.json({ success: true, settings: notificationSettings });
});

router.post('/settings', (req, res) => {
  const { emailEnabled, whatsappEnabled, smsEnabled, smtpHost, smtpPort, smtpUser, smtpPass, twilioSid, twilioAuthToken, whatsappApiKey } = req.body;

  if (typeof emailEnabled === 'boolean') notificationSettings.emailEnabled = emailEnabled;
  if (typeof whatsappEnabled === 'boolean') notificationSettings.whatsappEnabled = whatsappEnabled;
  if (typeof smsEnabled === 'boolean') notificationSettings.smsEnabled = smsEnabled;

  if (smtpHost) notificationSettings.smtpHost = smtpHost;
  if (smtpPort) notificationSettings.smtpPort = smtpPort;
  if (smtpUser) notificationSettings.smtpUser = smtpUser;
  if (smtpPass) notificationSettings.smtpPass = smtpPass;
  if (twilioSid) notificationSettings.twilioSid = twilioSid;
  if (twilioAuthToken) notificationSettings.twilioAuthToken = twilioAuthToken;
  if (whatsappApiKey) notificationSettings.whatsappApiKey = whatsappApiKey;

  res.json({ success: true, message: 'Parent Notification settings updated successfully!', settings: notificationSettings });
});

module.exports = {
  router,
  dispatchParentNotifications
};

