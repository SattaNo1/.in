// Satta No.1 — Admin Panel Logic
import {
  auth, db, googleProvider,
  signInWithPopup, fbSignOut, onAuthStateChanged,
  doc, getDoc, setDoc, addDoc, updateDoc, collection,
  query, where, orderBy, limit, getDocs, onSnapshot,
  increment, serverTimestamp
} from './firebase.js';

let adminUser = null;
let allUsers = [];
let allPayments = [];
let adminEmails = [];

// ─── AUTH ─────────────────────────────────────────────────────────────
document.getElementById('adminGoogleBtn')?.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) { showAdminToast('Login failed: ' + e.message); }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const isAdmin = await checkAdminAccess(user.email);
    if (isAdmin) {
      adminUser = user;
      document.getElementById('adminLoginPage').classList.add('hidden');
      document.getElementById('adminPanel').classList.remove('hidden');
      document.getElementById('adminAvatar').style.backgroundImage = `url(${user.photoURL})`;
      document.getElementById('adminName').textContent = user.displayName;
      document.getElementById('adminDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      loadAdminData();
      loadSettings();
    } else {
      await fbSignOut(auth);
      alert('Access denied. Your email is not authorized as admin.');
    }
  }
});

async function checkAdminAccess(email) {
  try {
    const snap = await getDoc(doc(db, 'settings', 'admins'));
    if (snap.exists()) {
      const emails = snap.data().emails || [];
      adminEmails = emails;
      return emails.includes(email);
    }
    // First time: allow if no admin set (setup mode)
    return true;
  } catch { return true; }
}

window.adminSignOut = () => fbSignOut(auth).then(() => location.reload());

// ─── TABS ─────────────────────────────────────────────────────────────
window.adminTab = (tab) => {
  document.querySelectorAll('.admin-tab').forEach(t => { t.classList.add('hidden'); t.classList.remove('active'); });
  document.querySelectorAll('.snav-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById(`tab-${tab}`);
  if (el) { el.classList.remove('hidden'); el.classList.add('active'); }
  event.currentTarget.classList.add('active');

  if (tab === 'payments') loadPayments('pending');
  if (tab === 'users') loadUsers();
  if (tab === 'bets') loadAllBets();
  if (tab === 'reports') loadReports();
};

// ─── LOAD DATA ────────────────────────────────────────────────────────
async function loadAdminData() {
  // Dashboard stats
  const today = new Date().toISOString().split('T')[0];

  const [usersSnap, betsSnap, paySnap, pendPaySnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(query(collection(db, 'bets'), where('date', '==', today))),
    getDocs(query(collection(db, 'payments'), where('status', '==', 'approved'))),
    getDocs(query(collection(db, 'payments'), where('status', '==', 'pending')))
  ]);

  const totalBetsToday = betsSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
  const totalPayout = betsSnap.docs.filter(d => d.data().status === 'win').reduce((s, d) => {
    const b = d.data();
    return s + (b.amount * 10);
  }, 0);
  const profit = totalBetsToday - totalPayout;

  document.getElementById('statTotalUsers').textContent = usersSnap.size;
  document.getElementById('statTotalBets').textContent = betsSnap.size;
  document.getElementById('statTotalMoney').textContent = '₹' + totalBetsToday;
  document.getElementById('statTotalPayout').textContent = '₹' + totalPayout;
  document.getElementById('statProfit').textContent = '₹' + Math.max(0, profit);
  document.getElementById('statPendingPayments').textContent = pendPaySnap.size;

  // Recent bets
  const recentBets = await getDocs(query(collection(db, 'bets'), orderBy('createdAt', 'desc'), limit(5)));
  const rbt = document.getElementById('dashRecentBets');
  rbt.innerHTML = recentBets.empty ? '<tr><td colspan="4" class="empty-row">No bets yet</td></tr>' :
    recentBets.docs.map(d => {
      const b = d.data();
      return `<tr><td>${b.userName || 'Unknown'}</td><td>${b.mainNumber}/${b.harupNumber}</td><td>₹${b.amount}</td><td><span class="badge badge-${b.status}">${b.status}</span></td></tr>`;
    }).join('');

  // Pending payments
  const dpp = document.getElementById('dashPendingPay');
  dpp.innerHTML = pendPaySnap.empty ? '<tr><td colspan="4" class="empty-row">No pending payments</td></tr>' :
    pendPaySnap.docs.map(d => {
      const p = d.data();
      return `<tr><td>${p.userName}</td><td>₹${p.amount}</td><td>${p.utrRef || '-'}</td>
        <td>
          <button class="admin-btn admin-btn-success admin-btn-sm" onclick="approvePayment('${d.id}','${p.userId}',${p.amount})">✓</button>
          <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="rejectPayment('${d.id}')">✗</button>
        </td></tr>`;
    }).join('');
}

// ─── RESULTS ─────────────────────────────────────────────────────────
window.addResult = async () => {
  const number = parseInt(document.getElementById('resultNumber').value);
  const harup = parseInt(document.getElementById('resultHarup').value);
  const date = document.getElementById('resultDate').value;
  const time = document.getElementById('resultTime').value;

  if (!number || number < 1 || number > 100) return showAdminToast('Enter valid number (1-100)');
  if (!harup || harup < 1 || harup > 9) return showAdminToast('Enter valid harup (1-9)');
  if (!date || !time) return showAdminToast('Enter date and time');

  try {
    const resultRef = await addDoc(collection(db, 'results'), {
      number, harup, date, time,
      status: 'open',
      createdAt: serverTimestamp()
    });

    // Calculate winners/losers
    await calculateWinners(resultRef.id, number, harup);
    showAdminToast(`Result ${number}/${harup} added & winners calculated!`);
    loadResultHistory();
  } catch (e) {
    showAdminToast('Error: ' + e.message);
  }
};

async function calculateWinners(resultId, number, harup) {
  const betsSnap = await getDocs(query(collection(db, 'bets'), where('status', '==', 'pending')));
  const settings = await getDoc(doc(db, 'settings', 'game'));
  const mult = settings.exists() ? (settings.data().multiplier || 10) : 10;
  const harupMult = settings.exists() ? (settings.data().harupMultiplier || 5) : 5;

  const batch = [];
  for (const betDoc of betsSnap.docs) {
    const bet = betDoc.data();
    const isMainWin = bet.mainNumber === number;
    const isHarupWin = bet.harupNumber === harup;
    const isWin = isMainWin || isHarupWin;
    const status = isWin ? 'win' : 'lose';
    let payout = 0;
    if (isMainWin) payout += bet.amount * mult;
    if (isHarupWin) payout += bet.amount * harupMult;

    batch.push(updateDoc(doc(db, 'bets', betDoc.id), { status, resultId, payout }));
    if (isWin && payout > 0) {
      batch.push(updateDoc(doc(db, 'users', bet.userId), {
        walletBalance: increment(payout),
        totalWins: increment(1)
      }));
      batch.push(addDoc(collection(db, 'wallet_transactions'), {
        userId: bet.userId,
        type: 'Payout',
        amount: payout,
        description: `Won on #${number} | Harup ${harup}`,
        createdAt: serverTimestamp()
      }));
      batch.push(addDoc(collection(db, 'notifications'), {
        userId: bet.userId,
        title: '🏆 You Won!',
        body: `Congratulations! You won ₹${payout} on number ${number}`,
        read: false,
        createdAt: serverTimestamp()
      }));
    }
  }
  await Promise.all(batch);
}

window.openResult = async () => {
  const snap = await getDocs(query(collection(db, 'results'), orderBy('createdAt', 'desc'), limit(1)));
  if (snap.empty) return showAdminToast('No result to open');
  await updateDoc(doc(db, 'results', snap.docs[0].id), { status: 'open' });
  showAdminToast('Result opened!');
};

window.closeResult = async () => {
  const snap = await getDocs(query(collection(db, 'results'), orderBy('createdAt', 'desc'), limit(1)));
  if (snap.empty) return showAdminToast('No result to close');
  await updateDoc(doc(db, 'results', snap.docs[0].id), { status: 'closed' });
  showAdminToast('Result closed!');
};

async function loadResultHistory() {
  const snap = await getDocs(query(collection(db, 'results'), orderBy('createdAt', 'desc'), limit(20)));
  const tb = document.getElementById('resultsTable');
  tb.innerHTML = snap.empty ? '<tr><td colspan="6" class="empty-row">No results</td></tr>' :
    snap.docs.map(d => {
      const r = d.data();
      return `<tr><td>${r.date}</td><td>${r.time}</td><td><b style="color:var(--gold)">${r.number}</b></td><td>${r.harup}</td><td><span class="badge badge-${r.status}">${r.status}</span></td><td>-</td></tr>`;
    }).join('');
}

// ─── PAYMENTS ─────────────────────────────────────────────────────────
window.filterPayments = (status) => {
  document.querySelectorAll('.pf-btn').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === status || (b.textContent === 'All' && status === 'all')));
  loadPayments(status);
};

async function loadPayments(filter = 'pending') {
  let q = filter === 'all'
    ? query(collection(db, 'payments'), orderBy('createdAt', 'desc'), limit(50))
    : query(collection(db, 'payments'), where('status', '==', filter), orderBy('createdAt', 'desc'), limit(50));

  const snap = await getDocs(q);
  const tb = document.getElementById('paymentsTable');
  if (snap.empty) { tb.innerHTML = '<tr><td colspan="6" class="empty-row">No payments found</td></tr>'; return; }

  tb.innerHTML = snap.docs.map(d => {
    const p = d.data();
    const ts = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-IN') : '-';
    return `<tr>
      <td>${ts}</td>
      <td>${p.userName}</td>
      <td>₹${p.amount}</td>
      <td>${p.utrRef || '-'}</td>
      <td><span class="badge badge-${p.status}">${p.status}</span></td>
      <td>
        ${p.status === 'pending' ? `
          <button class="admin-btn admin-btn-success admin-btn-sm" onclick="approvePayment('${d.id}','${p.userId}',${p.amount})">Approve</button>
          <button class="admin-btn admin-btn-danger admin-btn-sm" style="margin-left:4px" onclick="rejectPayment('${d.id}')">Reject</button>
        ` : '-'}
      </td>
    </tr>`;
  }).join('');
}

window.approvePayment = async (payId, userId, amount) => {
  try {
    await updateDoc(doc(db, 'payments', payId), { status: 'approved', approvedAt: serverTimestamp(), approvedBy: adminUser.email });
    await updateDoc(doc(db, 'users', userId), { walletBalance: increment(amount) });
    await addDoc(collection(db, 'wallet_transactions'), {
      userId, type: 'Credit', amount,
      description: `Payment approved by admin`,
      createdAt: serverTimestamp()
    });
    await addDoc(collection(db, 'notifications'), {
      userId, title: '✅ Payment Approved',
      body: `₹${amount} has been credited to your wallet`,
      read: false, createdAt: serverTimestamp()
    });
    showAdminToast(`Payment of ₹${amount} approved & wallet credited!`);
    loadAdminData();
    loadPayments('pending');
  } catch (e) { showAdminToast('Error: ' + e.message); }
};

window.rejectPayment = async (payId) => {
  try {
    await updateDoc(doc(db, 'payments', payId), { status: 'rejected', rejectedAt: serverTimestamp() });
    showAdminToast('Payment rejected');
    loadPayments('pending');
  } catch (e) { showAdminToast('Error: ' + e.message); }
};

// ─── USERS ────────────────────────────────────────────────────────────
async function loadUsers() {
  const snap = await getDocs(collection(db, 'users'));
  allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderUsers(allUsers);
}

function renderUsers(users) {
  const tb = document.getElementById('usersTable');
  document.getElementById('statTotalUsers').textContent = users.length;
  if (!users.length) { tb.innerHTML = '<tr><td colspan="6" class="empty-row">No users yet</td></tr>'; return; }
  tb.innerHTML = users.map(u => {
    const joined = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString('en-IN') : '-';
    return `<tr>
      <td>${u.name}</td>
      <td style="font-size:12px">${u.email}</td>
      <td style="color:var(--gold)">₹${u.walletBalance || 0}</td>
      <td>${joined}</td>
      <td>${u.totalBets || 0}</td>
      <td>
        <button class="admin-btn admin-btn-outline admin-btn-sm" onclick="viewUser('${u.id}')">View</button>
      </td>
    </tr>`;
  }).join('');
}

window.searchUsers = () => {
  const term = document.getElementById('userSearch').value.toLowerCase();
  renderUsers(allUsers.filter(u => u.name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term)));
};

window.viewUser = (uid) => {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  alert(`User: ${u.name}\nEmail: ${u.email}\nBalance: ₹${u.walletBalance}\nBets: ${u.totalBets}\nRef Code: ${u.referralCode}`);
};

// ─── ALL BETS ─────────────────────────────────────────────────────────
async function loadAllBets() {
  const snap = await getDocs(query(collection(db, 'bets'), orderBy('createdAt', 'desc'), limit(100)));
  const tb = document.getElementById('betsTable');
  if (snap.empty) { tb.innerHTML = '<tr><td colspan="6" class="empty-row">No bets yet</td></tr>'; return; }
  tb.innerHTML = snap.docs.map(d => {
    const b = d.data();
    return `<tr>
      <td>${b.date}</td>
      <td>${b.userName}</td>
      <td style="color:var(--gold);font-weight:700">${b.mainNumber}</td>
      <td>${b.harupNumber}</td>
      <td>₹${b.amount}</td>
      <td><span class="badge badge-${b.status}">${b.status}</span></td>
    </tr>`;
  }).join('');
}

// ─── REPORTS ──────────────────────────────────────────────────────────
async function loadReports() {
  const snap = await getDocs(query(collection(db, 'bets'), orderBy('date', 'desc')));
  const byDate = {};
  snap.docs.forEach(d => {
    const b = d.data();
    const date = b.date;
    if (!byDate[date]) byDate[date] = { bets: 0, amount: 0, payout: 0 };
    byDate[date].bets++;
    byDate[date].amount += b.amount || 0;
    if (b.status === 'win') byDate[date].payout += b.payout || 0;
  });

  const tb = document.getElementById('reportsTable');
  const dates = Object.keys(byDate).sort().reverse();
  if (!dates.length) { tb.innerHTML = '<tr><td colspan="5" class="empty-row">No data</td></tr>'; return; }
  tb.innerHTML = dates.map(date => {
    const r = byDate[date];
    const profit = r.amount - r.payout;
    return `<tr>
      <td>${date}</td>
      <td>${r.bets}</td>
      <td>₹${r.amount}</td>
      <td>₹${r.payout}</td>
      <td style="color:${profit >= 0 ? 'var(--green)' : 'var(--red)'}">₹${profit}</td>
    </tr>`;
  }).join('');
}

// ─── SETTINGS ─────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const g = await getDoc(doc(db, 'settings', 'game'));
    if (g.exists()) {
      const d = g.data();
      document.getElementById('settingMultiplier').value = d.multiplier || 10;
      document.getElementById('settingHarupMult').value = d.harupMultiplier || 5;
      document.getElementById('settingMinBet').value = d.minBet || 10;
      document.getElementById('settingRefBonus').value = d.referralBonus || 20;
    }
    const p = await getDoc(doc(db, 'settings', 'payment'));
    if (p.exists()) {
      const d = p.data();
      document.getElementById('settingUpiId').value = d.upiId || '';
      document.getElementById('settingPayName').value = d.payName || '';
      document.getElementById('settingPayStatus').value = d.enabled ? 'enabled' : 'disabled';
    }
    const a = await getDoc(doc(db, 'settings', 'admins'));
    if (a.exists()) {
      document.getElementById('settingAdminEmails').value = (a.data().emails || []).join('\n');
    }
  } catch (e) { /* ok if not set */ }
}

window.savePaymentSettings = async () => {
  try {
    await setDoc(doc(db, 'settings', 'payment'), {
      upiId: document.getElementById('settingUpiId').value.trim(),
      payName: document.getElementById('settingPayName').value.trim(),
      enabled: document.getElementById('settingPayStatus').value === 'enabled',
      updatedAt: serverTimestamp()
    });
    showAdminToast('Payment settings saved!');
  } catch (e) { showAdminToast('Error: ' + e.message); }
};

window.saveGameSettings = async () => {
  try {
    await setDoc(doc(db, 'settings', 'game'), {
      multiplier: parseInt(document.getElementById('settingMultiplier').value),
      harupMultiplier: parseInt(document.getElementById('settingHarupMult').value),
      minBet: parseInt(document.getElementById('settingMinBet').value),
      referralBonus: parseInt(document.getElementById('settingRefBonus').value),
      updatedAt: serverTimestamp()
    });
    showAdminToast('Game settings saved!');
  } catch (e) { showAdminToast('Error: ' + e.message); }
};

window.saveAdminEmails = async () => {
  const raw = document.getElementById('settingAdminEmails').value;
  const emails = raw.split('\n').map(e => e.trim()).filter(Boolean);
  try {
    await setDoc(doc(db, 'settings', 'admins'), { emails, updatedAt: serverTimestamp() });
    showAdminToast('Admin emails saved!');
  } catch (e) { showAdminToast('Error: ' + e.message); }
};

window.adjustWallet = async () => {
  const identifier = document.getElementById('adjUserId').value.trim();
  const amount = parseInt(document.getElementById('adjAmount').value);
  const reason = document.getElementById('adjReason').value.trim();
  if (!identifier || isNaN(amount) || !reason) return showAdminToast('Fill all fields');

  try {
    // Find user by email
    const snap = await getDocs(query(collection(db, 'users'), where('email', '==', identifier)));
    if (snap.empty) return showAdminToast('User not found');
    const userId = snap.docs[0].id;
    await updateDoc(doc(db, 'users', userId), { walletBalance: increment(amount) });
    await addDoc(collection(db, 'wallet_transactions'), {
      userId, type: amount > 0 ? 'Credit' : 'Debit',
      amount: Math.abs(amount),
      description: `Admin adjustment: ${reason}`,
      createdAt: serverTimestamp()
    });
    showAdminToast(`Wallet adjusted by ₹${amount} for ${identifier}`);
  } catch (e) { showAdminToast('Error: ' + e.message); }
};

// ─── EXPORT ───────────────────────────────────────────────────────────
window.exportResults = async () => {
  const snap = await getDocs(query(collection(db, 'results'), orderBy('createdAt', 'desc')));
  const data = snap.docs.map(d => d.data());
  downloadJSON(data, 'results');
};

window.exportUsers = async () => {
  const snap = await getDocs(collection(db, 'users'));
  const rows = ['Name,Email,Balance,Referral Code,Total Bets,Joined'];
  snap.docs.forEach(d => {
    const u = d.data();
    const joined = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : '-';
    rows.push(`"${u.name}","${u.email}",${u.walletBalance},"${u.referralCode}",${u.totalBets || 0},"${joined}"`);
  });
  downloadCSV(rows.join('\n'), 'users');
};

window.exportReport = async (fmt) => {
  const snap = await getDocs(query(collection(db, 'bets'), orderBy('date', 'desc')));
  const data = snap.docs.map(d => d.data());
  if (fmt === 'csv') {
    const rows = ['Date,User,Number,Harup,Amount,Status'];
    data.forEach(b => rows.push(`${b.date},${b.userName},${b.mainNumber},${b.harupNumber},${b.amount},${b.status}`));
    downloadCSV(rows.join('\n'), 'bets-report');
  } else {
    downloadJSON(data, 'bets-report');
  }
};

window.backupData = async () => {
  const [users, bets, payments, results] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'bets')),
    getDocs(collection(db, 'payments')),
    getDocs(collection(db, 'results'))
  ]);
  const backup = {
    timestamp: new Date().toISOString(),
    users: users.docs.map(d => d.data()),
    bets: bets.docs.map(d => d.data()),
    payments: payments.docs.map(d => d.data()),
    results: results.docs.map(d => d.data())
  };
  downloadJSON(backup, `backup-${Date.now()}`);
  showAdminToast('Backup downloaded!');
};

function downloadJSON(data, name) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${name}.json`; a.click();
}

function downloadCSV(csv, name) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`; a.click();
}

// ─── TOAST ────────────────────────────────────────────────────────────
function showAdminToast(msg) {
  const el = document.getElementById('adminToast');
  el.textContent = msg; el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}

// ─── INIT ─────────────────────────────────────────────────────────────
document.getElementById('resultDate').value = new Date().toISOString().split('T')[0];
document.getElementById('resultTime').value = new Date().toTimeString().slice(0, 5);
loadResultHistory();
