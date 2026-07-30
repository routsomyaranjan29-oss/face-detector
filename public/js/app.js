// Global Application State
const appState = {
  token: localStorage.getItem('visioface_token') || null,
  user: JSON.parse(localStorage.getItem('visioface_user') || 'null'),
  students: [],
  attendanceLogs: [],
  charts: {}
};

// Toast notification helper
window.showToast = function(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type} animate-pop`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'warning') icon = 'fa-triangle-exclamation';
  if (type === 'danger') icon = 'fa-circle-xmark';

  toast.innerHTML = `
    <i class="fa-solid ${icon} toast-icon"></i>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
};

// Switch Tab Navigation Helper
window.switchTab = function(tabId) {
  const links = document.querySelectorAll('.nav-link, .mobile-nav-item');
  const views = document.querySelectorAll('.tab-view');

  links.forEach(l => {
    if (l.getAttribute('data-tab') === tabId) l.classList.add('active');
    else l.classList.remove('active');
  });

  views.forEach(v => {
    if (v.id === `view-${tabId}`) v.classList.add('active');
    else v.classList.remove('active');
  });

  // Close mobile sidebar if open
  document.getElementById('app-sidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebar-backdrop')?.classList.remove('show');

  if (tabId === 'dashboard') loadDashboardStats();
  if (tabId === 'students') loadStudentsDirectory();
  if (tabId === 'attendance-history') loadAttendanceHistory();
};

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initAuth();
  initNavigation();
  initThemeToggle();
  initModals();
  initExportHandlers();
  initMobileAndQR();
});

// Live Clock Initializer
function initClock() {
  function updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    const timeElem = document.getElementById('live-time');
    const dateElem = document.getElementById('live-date');
    if (timeElem) timeElem.textContent = timeStr;
    if (dateElem) dateElem.textContent = dateStr;
  }
  updateTime();
  setInterval(updateTime, 1000);
}

// Authentication & Session Management
function initAuth() {
  const loginScreen = document.getElementById('login-screen');
  const appContainer = document.getElementById('app');

  // Check stored session token
  if (appState.token && appState.user) {
    loginScreen.classList.add('hidden');
    appContainer.classList.remove('hidden');
    document.getElementById('current-user-name').textContent = appState.user.name || 'System Admin';
    loadDashboardStats();
  } else {
    loginScreen.classList.remove('hidden');
    appContainer.classList.add('hidden');
  }

  // Auth Mode Switcher (Login vs Sign Up)
  const tabLogin = document.getElementById('tab-btn-login');
  const tabSignup = document.getElementById('tab-btn-signup');
  const formLogin = document.getElementById('form-login');
  const formSignup = document.getElementById('form-signup');

  tabLogin?.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    formLogin.classList.remove('hidden');
    formSignup.classList.add('hidden');
  });

  tabSignup?.addEventListener('click', () => {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    formSignup.classList.remove('hidden');
    formLogin.classList.add('hidden');
  });

  // Login Submit
  formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success) {
        appState.token = data.token;
        appState.user = data.user;
        localStorage.setItem('visioface_token', data.token);
        localStorage.setItem('visioface_user', JSON.stringify(data.user));

        loginScreen.classList.add('hidden');
        appContainer.classList.remove('hidden');
        document.getElementById('current-user-name').textContent = data.user.name;

        window.showToast(`Welcome back, ${data.user.name}!`, 'success');
        loadDashboardStats();
      } else {
        const alertBox = document.getElementById('login-alert-box');
        document.getElementById('login-alert-msg').textContent = data.message || 'Invalid credentials';
        alertBox.classList.remove('hidden');
      }
    } catch (err) {
      window.showToast('Server connection error during login.', 'danger');
    }
  });

  // Logout Submit
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem('visioface_token');
    localStorage.removeItem('visioface_user');
    appState.token = null;
    appState.user = null;

    loginScreen.classList.remove('hidden');
    appContainer.classList.add('hidden');
    window.showToast('Logged out successfully.', 'info');
  });
}

// Navigation Tab Switchers
function initNavigation() {
  const links = document.querySelectorAll('.nav-link');
  links.forEach(link => {
    link.addEventListener('click', () => {
      const tabId = link.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

// Theme Switcher (Dark / Light)
function initThemeToggle() {
  const btn = document.getElementById('btn-theme-toggle');
  btn?.addEventListener('click', () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', nextTheme);
    btn.querySelector('i').className = nextTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  });
}

// Modal Backdrop Handlers
function initModals() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      document.getElementById(modalId)?.classList.remove('show');
    });
  });

  document.getElementById('btn-open-add-student-modal')?.addEventListener('click', () => {
    if (window.faceEngine) {
      window.faceEngine.openRegisterWizard();
    }
  });
}

// Dashboard Analytics & Charts
async function loadDashboardStats() {
  try {
    const res = await fetch('/api/reports/dashboard');
    const data = await res.json();

    if (data.success) {
      const stats = data.stats;
      document.getElementById('kpi-total-students').textContent = stats.totalStudents;
      document.getElementById('kpi-present-today').textContent = stats.presentToday;
      document.getElementById('kpi-absent-today').textContent = stats.absentToday;
      document.getElementById('kpi-late-sub').textContent = `${stats.lateToday} Late Arrivals`;
      document.getElementById('kpi-rate').textContent = `${stats.attendancePercentage}%`;
      document.getElementById('kpi-rate-fill').style.width = `${stats.attendancePercentage}%`;

      // Live Counters on Attendance Panel
      document.getElementById('counter-present').textContent = stats.presentToday;
      document.getElementById('counter-absent').textContent = stats.absentToday;
      document.getElementById('counter-late').textContent = stats.lateToday;

      renderDailyTrendChart(data.trend);
      renderBranchBreakdownChart(data.departments);
    }
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

function renderDailyTrendChart(trendData) {
  const ctx = document.getElementById('chart-daily-trend')?.getContext('2d');
  if (!ctx) return;

  if (appState.charts.dailyTrend) appState.charts.dailyTrend.destroy();

  const labels = trendData.map(t => t.day);
  const presents = trendData.map(t => t.present);

  appState.charts.dailyTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Present Students',
        data: presents,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        fill: true,
        tension: 0.4,
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.08)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderBranchBreakdownChart(deptData) {
  const ctx = document.getElementById('chart-branch-pie')?.getContext('2d');
  if (!ctx) return;

  if (appState.charts.branchPie) appState.charts.branchPie.destroy();

  const labels = deptData.map(d => d.branch || d.department);
  const presents = deptData.map(d => d.present);

  appState.charts.branchPie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: presents,
        backgroundColor: ['#3b82f6', '#22c55e', '#a855f7', '#eab308', '#ec4899', '#06b6d4'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

// Student Directory Loader & Actions
async function loadStudentsDirectory() {
  const search = document.getElementById('student-search-input')?.value || '';
  const branch = document.getElementById('student-branch-filter')?.value || 'All';
  const semester = document.getElementById('student-semester-filter')?.value || 'All';

  try {
    const query = new URLSearchParams({ search, branch, semester });
    const res = await fetch(`/api/students?${query.toString()}`);
    const data = await res.json();

    if (data.success) {
      appState.students = data.students || [];
      renderStudentsTable(appState.students);
    }
  } catch (err) {
    console.error('Error loading students:', err);
  }
}

function renderStudentsTable(students) {
  const tbody = document.getElementById('students-table-body');
  if (!tbody) return;

  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center p-4 text-muted">No students found matching filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = students.map(s => {
    const sId = s.studentId || s.student_id;
    const rNum = s.rollNumber || s.roll_number;
    const regNum = s.registrationNumber || s.registration_number || `REG-${rNum}`;
    const branch = s.branch || s.department || 'Computer Science';
    const sem = s.semester || 'Semester 1';
    const sec = s.section || 'A';
    const photo = s.photoPath || s.photo_path;
    const isEnrolled = s.faceEnrolled || s.face_enrolled;

    const photoHtml = photo 
      ? `<img src="/${photo}" class="student-avatar-thumb" alt="${s.name}" />`
      : `<div class="student-avatar-placeholder">${s.name.charAt(0)}</div>`;

    const statusBadge = isEnrolled 
      ? `<span class="badge bg-success"><i class="fa-solid fa-face-smile me-1"></i> Face Enrolled</span>`
      : `<span class="badge bg-warning text-dark"><i class="fa-solid fa-exclamation-triangle me-1"></i> Pending Capture</span>`;

    return `
      <tr>
        <td>${photoHtml}</td>
        <td class="fw-bold">${s.name}</td>
        <td><code>${rNum}</code></td>
        <td><small>${regNum}</small></td>
        <td>${branch}</td>
        <td>${sem} (${sec})</td>
        <td>${s.mobile || s.phone || 'N/A'}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteStudent('${sId}')" title="Delete Student">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Student Directory Search Event Listeners
document.getElementById('student-search-input')?.addEventListener('input', loadStudentsDirectory);
document.getElementById('student-branch-filter')?.addEventListener('change', loadStudentsDirectory);
document.getElementById('student-semester-filter')?.addEventListener('change', loadStudentsDirectory);

window.deleteStudent = async function(sId) {
  if (!confirm(`Are you sure you want to delete student ${sId}?`)) return;

  try {
    const res = await fetch(`/api/students/${sId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      window.showToast('Student record deleted successfully.', 'success');
      loadStudentsDirectory();
      loadDashboardStats();
    } else {
      window.showToast(data.message || 'Failed to delete student.', 'danger');
    }
  } catch (err) {
    window.showToast('Server error deleting student.', 'danger');
  }
};

// Attendance History Loader & Filters
async function loadAttendanceHistory() {
  const date = document.getElementById('history-date-filter')?.value || '';
  const branch = document.getElementById('history-branch-filter')?.value || 'All';
  const semester = document.getElementById('history-semester-filter')?.value || 'All';
  const status = document.getElementById('history-status-filter')?.value || 'All';

  try {
    const query = new URLSearchParams({ date, branch, semester, status });
    const res = await fetch(`/api/attendance/history?${query.toString()}`);
    const data = await res.json();

    if (data.success) {
      appState.attendanceLogs = data.logs || [];
      renderAttendanceHistoryTable(appState.attendanceLogs);
    }
  } catch (err) {
    console.error('Error loading attendance history:', err);
  }
}

function renderAttendanceHistoryTable(logs) {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center p-4 text-muted">No attendance logs found for selected criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(l => {
    const rNum = l.rollNumber || l.roll_number;
    const sId = l.studentId || l.student_id;
    const branch = l.branch || l.department || 'Computer Science';
    const device = l.device || l.mode || 'Webcam';
    const conf = l.confidence ? `${l.confidence}%` : '98.5%';

    let statusBadge = '<span class="badge bg-success">Present</span>';
    if (l.status === 'Late') statusBadge = '<span class="badge bg-warning text-dark">Late</span>';
    if (l.status === 'Absent') statusBadge = '<span class="badge bg-danger">Absent</span>';

    return `
      <tr>
        <td>${l.date}</td>
        <td class="fw-bold">${l.time}</td>
        <td><code>${sId}</code></td>
        <td>${l.name}</td>
        <td><code>${rNum}</code></td>
        <td>${branch}</td>
        <td>${statusBadge}</td>
        <td><i class="fa-solid fa-video text-accent me-1"></i> ${device}</td>
        <td><strong class="text-success">${conf}</strong></td>
      </tr>
    `;
  }).join('');
}

document.getElementById('btn-apply-history-filters')?.addEventListener('click', loadAttendanceHistory);
document.getElementById('btn-reset-history-filters')?.addEventListener('click', () => {
  document.getElementById('history-date-filter').value = '';
  document.getElementById('history-branch-filter').value = 'All';
  document.getElementById('history-semester-filter').value = 'All';
  document.getElementById('history-status-filter').value = 'All';
  loadAttendanceHistory();
});

// Export Handlers (Excel, CSV, PDF, Print)
function initExportHandlers() {
  // Export Excel (.xlsx using SheetJS)
  document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    if (appState.attendanceLogs.length === 0) {
      window.showToast('No attendance logs to export.', 'warning');
      return;
    }
    const excelData = appState.attendanceLogs.map(l => ({
      Date: l.date,
      Time: l.time,
      'Student ID': l.studentId || l.student_id,
      Name: l.name,
      'Roll Number': l.rollNumber || l.roll_number,
      Branch: l.branch || l.department,
      Status: l.status,
      Device: l.device || 'Webcam',
      Confidence: `${l.confidence || 98.5}%`
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');
    XLSX.writeFile(workbook, `Attendance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    window.showToast('Excel report downloaded successfully!', 'success');
  });

  // Export CSV Download
  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    const date = document.getElementById('history-date-filter')?.value || '';
    const branch = document.getElementById('history-branch-filter')?.value || 'All';
    window.location.href = `/api/reports/export/csv?date=${date}&branch=${branch}`;
    window.showToast('Downloading CSV report...', 'info');
  });

  // Export PDF using html2pdf
  document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    const element = document.getElementById('history-printable-area');
    if (!element) return;

    const opt = {
      margin: 0.5,
      filename: `Attendance_Report_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' }
    };

    window.html2pdf().set(opt).from(element).save();
    window.showToast('PDF report exported successfully!', 'success');
  });

  // Print Window
  document.getElementById('btn-print-history')?.addEventListener('click', () => {
    window.print();
  });
}

// Mobile Responsive Drawer, QR Code Generator & Mobile Attendance Handlers
function initMobileAndQR() {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const navToggle = document.getElementById('btn-mobile-nav-toggle');

  // Mobile Hamburger Toggle
  navToggle?.addEventListener('click', () => {
    sidebar?.classList.toggle('mobile-open');
    backdrop?.classList.toggle('show');
  });

  backdrop?.addEventListener('click', () => {
    sidebar?.classList.remove('mobile-open');
    backdrop?.classList.remove('show');
  });

  // Mobile Bottom Nav item click handlers
  document.querySelectorAll('.mobile-nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      window.switchTab(tabId);
    });
  });

  // QR Code Modal Open Buttons
  const qrButtons = [
    'btn-open-qr-modal',
    'btn-attendance-qr',
    'btn-mobile-show-qr',
    'mobile-bottom-qr-trigger'
  ];

  qrButtons.forEach(btnId => {
    document.getElementById(btnId)?.addEventListener('click', () => {
      openAttendanceQRModal();
    });
  });

  // Copy Mobile QR Link
  document.getElementById('btn-copy-qr-link')?.addEventListener('click', () => {
    const urlElem = document.getElementById('qr-target-url');
    if (urlElem) {
      navigator.clipboard.writeText(urlElem.textContent);
      window.showToast('Mobile attendance link copied to clipboard!', 'success');
    }
  });

  // Open Mobile View Tab from Modal
  document.getElementById('btn-open-mobile-tab')?.addEventListener('click', () => {
    document.getElementById('modal-qr-code')?.classList.remove('show');
    window.switchTab('mobile-attendance');
  });

  // Manual Roll Number Verification on Mobile
  document.getElementById('btn-mobile-verify-roll')?.addEventListener('click', async () => {
    const input = document.getElementById('mobile-roll-input');
    const rollNum = input?.value.trim();
    if (!rollNum) {
      window.showToast('Please enter a valid Roll Number or Student ID.', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roll_number: rollNum,
          student_id: rollNum,
          status: 'Present',
          device: 'Mobile Phone (Manual Roll Check)',
          confidence: '100%'
        })
      });
      const data = await res.json();
      if (data.success) {
        window.showToast(`✔ Attendance marked Present for Roll #${rollNum}!`, 'success');
        input.value = '';
        
        // Add to mobile feed list
        const mobileFeed = document.getElementById('mobile-feed-list');
        if (mobileFeed) {
          const item = document.createElement('div');
          item.className = 'feed-item animate-pop';
          item.innerHTML = `
            <div class="feed-icon bg-success"><i class="fa-solid fa-user-check"></i></div>
            <div class="feed-info">
              <span class="feed-name">Roll #${rollNum}</span>
              <span class="feed-meta">Mobile Manual Check • ${new Date().toLocaleTimeString()}</span>
            </div>
            <span class="badge bg-success">Present</span>
          `;
          const empty = mobileFeed.querySelector('.feed-empty');
          if (empty) empty.remove();
          mobileFeed.insertBefore(item, mobileFeed.firstChild);
        }
      } else {
        window.showToast(data.message || 'Failed to mark attendance for Roll Number.', 'danger');
      }
    } catch (err) {
      window.showToast('Server error recording manual attendance.', 'danger');
    }
  });

  // Check URL parameters for ?mode=mobile on load
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'mobile' || window.location.hash === '#mobile') {
    setTimeout(() => {
      window.switchTab('mobile-attendance');
      window.showToast('Mobile attendance mode launched!', 'info');
    }, 500);
  }
}

// Generate Dynamic QR Code helper with LAN network IP detection
async function openAttendanceQRModal() {
  const modal = document.getElementById('modal-qr-code');
  const qrContainer = document.getElementById('qrcode-container');
  const urlElem = document.getElementById('qr-target-url');
  if (!modal || !qrContainer) return;

  // Clear previous QR code
  qrContainer.innerHTML = '';

  let mobileUrl = `${window.location.protocol}//${window.location.host}?mode=mobile`;

  // Fetch local LAN IP from server endpoint so phone camera can scan over Wi-Fi
  try {
    const res = await fetch('/api/info');
    const data = await res.json();
    if (data.success && data.localIp && data.localIp !== '127.0.0.1') {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        mobileUrl = `http://${data.localIp}:${data.port || 3000}?mode=mobile`;
      }
    }
  } catch (err) {
    console.warn('[QR] Could not fetch server network IP, using current host URL.');
  }

  if (urlElem) urlElem.textContent = mobileUrl;

  if (window.QRCode) {
    new QRCode(qrContainer, {
      text: mobileUrl,
      width: 180,
      height: 180,
      colorDark: '#0f172a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  } else {
    // Fallback QR Code image generator if CDN is unavailable
    const fallbackImg = document.createElement('img');
    fallbackImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mobileUrl)}`;
    qrContainer.appendChild(fallbackImg);
  }

  modal.classList.add('show');
}
