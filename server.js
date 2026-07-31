const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const os = require('os');
const { initDatabase } = require('./db/database');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Helper function to extract machine's local IPv4 network addresses (prioritizing Wi-Fi & LAN)
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  addresses.sort((a, b) => {
    if (a.startsWith('192.168.') || a.startsWith('10.')) return -1;
    if (b.startsWith('192.168.') || b.startsWith('10.')) return 1;
    return 0;
  });
  return addresses.length > 0 ? addresses : ['127.0.0.1'];
}

function getLocalIpAddress() {
  return getLocalIpAddresses()[0];
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static Asset Directories
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const { router: authRoutes } = require('./routes/auth');
const studentRoutes = require('./routes/students');
const faceRoutes = require('./routes/face');
const attendanceRoutes = require('./routes/attendance');
const reportRoutes = require('./routes/reports');
const { router: notificationRoutes } = require('./routes/notifications');

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/face', faceRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);

// Endpoint for Mobile QR Code Network URL
app.get('/api/info', (req, res) => {
  const ips = getLocalIpAddresses();
  const mainIp = ips[0];
  res.json({
    success: true,
    localIp: mainIp,
    allIps: ips,
    port: PORT,
    mobileUrl: `http://${mainIp}:${PORT}?mode=mobile`
  });
});

// SPA Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize Database and Start Server on all interfaces (0.0.0.0)
initDatabase()
  .then(() => {
    const localIp = getLocalIpAddress();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`====================================================`);
      console.log(`🚀 Face Detection Attendance System running!`);
      console.log(`🌐 Local Web Server: http://localhost:${PORT}`);
      console.log(`📱 Mobile Network:   http://${localIp}:${PORT}?mode=mobile`);
      console.log(`====================================================`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
