


// Satta No.1 — Main App Logic
import {
  auth, db, googleProvider,
  signInWithPopup, fbSignOut, onAuthStateChanged,
  doc, getDoc, setDoc, addDoc, updateDoc, collection,
  query, where, orderBy, limit, getDocs, onSnapshot,
  increment, serverTimestamp, Timestamp
} from './firebase.js';

// ─── STATE ───────────────────────────────────────────────────────────
let currentUser = null;
let userData = null;
let gameSettings = { multiplier: 90, harupMultiplier: 9, minBet: 10, referralBonus: 20 };
let paymentSettings = { upiId: 'sattano1@upi', payName: 'Satta No.1', enabled: true };
let deferredInstallPrompt = null;
let currentHistoryTab = 'bets';
let unsubscribers = [];

// New Betting States
let playMode = 'single'; 
let singleSelection = null; 
let multiSelection = []; 

// ─── PWA INSTALL ─────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installBanner')?.classList.remove('hidden');
  document.getElementById('installMenuItem')?.style.setProperty('display', 'flex');
});

window.triggerInstall = async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  if (result.outcome === 'accepted') showToast('App installed successfully! 🎉', 'success');
};

document.getElementById('installBtn')?.addEventListener('click', triggerInstall);

// ─── AUTH ─────────────────────────────────────────────────────────────
document.getElementById('googleLoginBtn')?.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    showToast('Login failed: ' + e.message, 'error');
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await initUser(user);
    hideSplash();
    showApp();
    loadSettings();
    startListeners();
    buildGrids(); // Build number grids once logged in
  } else {
    currentUser = null;
    userData = null;
    hideSplash();
    showLogin();
  }
});

window.signOut = async () => {
  unsubscribers.forEach(u => u());
  await fbSignOut(auth);
};

// ─── USER INIT ────────────────────────────────────────────────────────
async function initUser(user) {
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    const refCode = generateRefCode(user.displayName);
    const refBy = new URLSearchParams(window.location.search).get('ref') || '';

    await setDoc(userRef, {
      userId: user.uid,
      name: user.displayName,
      email: user.email,
      photoURL: user.photoURL || '',
      walletBalance: 0,
      referralCode: refCode,
      referredBy: refBy,
      totalReferrals: 0,
      totalBonus: 0,
      totalBets: 0,
      totalWins: 0,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp()
    });

    if (refBy) await creditReferrer(refBy, user);
    userData = (await getDoc(userRef)).data();
  } else {
    await updateDoc(userRef, { lastLogin: serverTimestamp() });
    userData = snap.data();
  }
  updateUI();
}

function generateRefCode(name) {
  const cleaned = (name || 'USER').replace(/\s+/g, '').toUpperCase().slice(0, 5);
  return cleaned + Math.floor(1000 + Math.random() * 9000);
}

async function creditReferrer(refCode, newUser) {
  const q = query(collection(db, 'users'), where('referralCode', '==', refCode));
  const snap = await getDocs(q);
  if (snap.empty) return;
  const referrer = snap.docs[0];
  const bonus = gameSettings.referralBonus || 20;

  await updateDoc(doc(db, 'users', referrer.id), {
    walletBalance: increment(bonus),
    totalReferrals: increment(1),
    totalBonus: increment(bonus)
  });

  await addDoc(collection(db, 'referrals'), {
    referrerId: referrer.id,
    referrerCode: refCode,
    newUserId: newUser.uid,
    newUserName: newUser.displayName,
    bonusAmount: bonus,
    status: 'completed',
    createdAt: serverTimestamp()
  });

  await addDoc(collection(db, 'wallet_transactions'), {
    userId: referrer.id,
    type: 'Referral Bonus',
    amount: bonus,
    description: `Referral bonus for ${newUser.displayName}`,
    createdAt: serverTimestamp()
  });

  showToast(`₹${bonus} referral bonus credited!`, 'success');
}

// ─── SETTINGS LOADER ─────────────────────────────────────────────────
async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'game'));
    if (snap.exists()) Object.assign(gameSettings, snap.data());
    const pSnap = await getDoc(doc(db, 'settings', 'payment'));
    if (pSnap.exists()) Object.assign(paymentSettings, pSnap.data());
    document.getElementById('displayUpiId').textContent = paymentSettings.upiId || 'sattano1@upi';
    generateQR();
  } catch (e) { console.log(e); }
}

// ─── UI HELPERS ───────────────────────────────────────────────────────
function hideSplash() {
  setTimeout(() => {
    const splash = document.getElementById('splash');
    if (splash) { splash.style.opacity = '0'; splash.style.transition = 'opacity 0.5s'; setTimeout(() => splash.remove(), 500); }
  }, 1800);
}
function showApp() {
  document.getElementById('loginPage')?.classList.add('hidden');
  document.getElementById('mainApp')?.classList.remove('hidden');
}
function showLogin() {
  document.getElementById('loginPage')?.classList.remove('hidden');
  document.getElementById('mainApp')?.classList.add('hidden');
}

function updateUI() {
  if (!userData || !currentUser) return;
  const bal = userData.walletBalance || 0;
  document.getElementById('headerBalance').textContent = bal;
  document.getElementById('walletBalance').textContent = bal;

  const img = currentUser.photoURL;
  if (img) {
    document.getElementById('headerAvatar').style.backgroundImage = `url(${img})`;
    document.getElementById('profileAvatarLg').style.backgroundImage = `url(${img})`;
  }
  document.getElementById('profileName').textContent = currentUser.displayName;
  document.getElementById('profileEmail').textContent = currentUser.email;
  document.getElementById('pstatBets').textContent = userData.totalBets || 0;
  document.getElementById('pstatWins').textContent = userData.totalWins || 0;
  document.getElementById('pstatBonus').textContent = '₹' + (userData.totalBonus || 0);

  document.getElementById('userRefCode').textContent = userData.referralCode || '--';
  document.getElementById('userRefLink').textContent = `${location.origin}?ref=${userData.referralCode}`;
  document.getElementById('refTotal').textContent = userData.totalReferrals || 0;
  document.getElementById('refBonus').textContent = '₹' + (userData.totalBonus || 0);
}

// ─── PAGE NAVIGATION ──────────────────────────────────────────────────
window.showPage = (page) => {
  document.querySelectorAll('.page-section').forEach(s => {
    s.classList.remove('active'); s.classList.add('hidden');
  });
  const target = document.getElementById(`page-${page}`);
  if (target) { target.classList.remove('hidden'); target.classList.add('active'); }
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  if (page === 'home') loadActiveBets();
  if (page === 'wallet') loadTransactions();
  if (page === 'history') loadHistory(currentHistoryTab);
  if (page === 'referral') loadReferralHistory();
  if (page === 'notifications') loadNotifications();
  if (page === 'addmoney') generateQR();
};

// ─── REAL-TIME LISTENERS ──────────────────────────────────────────────
function startListeners() {
  if (!currentUser) return;
  unsubscribers.forEach(u => u());
  unsubscribers = [];

  const unsub1 = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
    if (snap.exists()) {
      userData = snap.data();
      updateUI();
    }
  });

  const unsub2 = onSnapshot(
    query(collection(db, 'results'), orderBy('createdAt', 'desc'), limit(1)),
    (snap) => {
      if (!snap.empty) {
        const r = snap.docs[0].data();
        document.getElementById('todayResult').textContent = r.number || '--';
        document.getElementById('todayHarup').textContent = r.harup || '-';
        const dot = document.querySelector('.status-dot');
        const txt = document.getElementById('resultStatusText');
        if (r.status === 'open') { dot.className = 'status-dot open'; txt.textContent = 'Result is LIVE!'; }
        else if (r.status === 'closed') { dot.className = 'status-dot closed'; txt.textContent = 'Result closed'; }
        else { dot.className = 'status-dot waiting'; txt.textContent = 'Waiting for result...'; }
      }
    }
  );

  const unsub3 = onSnapshot(
    query(collection(db, 'results'), where('status', '==', 'closed'), orderBy('createdAt', 'desc'), limit(10)),
    (snap) => renderRecentResults(snap.docs.map(d => d.data()))
  );

  unsubscribers.push(unsub1, unsub2, unsub3);
  startCountdown();
}

function renderRecentResults(results) {
  const el = document.getElementById('recentResults');
  if (!results.length) { el.innerHTML = '<div class="results-empty">No results yet</div>'; return; }
  el.innerHTML = results.map(r => `
    <div class="result-chip">
      <div class="result-chip-num">${r.number}</div>
      <div class="result-chip-harup">H: ${r.harup}</div>
      <div class="result-chip-date">${formatDate(r.date)}</div>
    </div>
  `).join('');
}

// ─── COUNTDOWN ────────────────────────────────────────────────────────
function startCountdown() {
  const tick = () => {
    const now = new Date();
    const target = new Date();
    target.setHours(21, 0, 0, 0); 
    if (now > target) target.setDate(target.getDate() + 1);
    const diff = target - now;
    const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    const el = document.getElementById('countdownTimer');
    if (el) el.textContent = `${h}:${m}:${s}`;
  };
  tick(); setInterval(tick, 1000);
}


// ==========================================
// NAYA BETTING LOGIC (SINGLE & MULTIPLE)
// ==========================================

function buildGrids() {
  const mainGrid = document.getElementById('mainGrid');
  if (mainGrid && !mainGrid.children.length) {
    for (let i = 1; i <= 100; i++) {
      const numStr = i.toString().padStart(2, '0'); // Example: 01, 02.. 100
      const b = document.createElement('button');
      b.className = 'num-btn'; b.textContent = numStr;
      b.id = `btn-main-${numStr}`;
      b.onclick = () => window.selectNumber('main', numStr);
      mainGrid.appendChild(b);
    }
  }
  const harupGrid = document.getElementById('harupGrid');
  if (harupGrid && !harupGrid.children.length) {
    for (let i = 1; i <= 9; i++) {
      const b = document.createElement('button');
      b.className = 'harup-btn'; b.textContent = i;
      b.id = `btn-harup-${i}`;
      b.onclick = () => window.selectNumber('harup', i.toString());
      harupGrid.appendChild(b);
    }
  }
}

window.setPlayMode = function(mode) {
  playMode = mode;
  document.getElementById('modeSingleBtn').classList.toggle('active', mode === 'single');
  document.getElementById('modeMultiBtn').classList.toggle('active', mode === 'multi');
  
  if(mode === 'single') {
    document.getElementById('singleBetBox').classList.remove('hidden');
    document.getElementById('multiBetBox').classList.add('hidden');
  } else {
    document.getElementById('singleBetBox').classList.add('hidden');
    document.getElementById('multiBetBox').classList.remove('hidden');
  }
  
  singleSelection = null;
  multiSelection = [];
  updateGridUI();
  updateMultiCartUI();
  document.getElementById('singleSelectedText').innerText = "Select a Jodi or Harup Number";
  document.getElementById('singleBetAmount').value = '';
};

window.selectNumber = function(type, num) {
  if (playMode === 'single') {
    singleSelection = { type: type, number: num };
    let typeText = type === 'main' ? 'JODI' : 'HARUP';
    document.getElementById('singleSelectedText').innerText = `Selected: ${typeText} - ${num}`;
  } else {
    let index = multiSelection.findIndex(item => item.type === type && item.number === num);
    if (index > -1) {
      multiSelection.splice(index, 1); 
    } else {
      multiSelection.push({ type: type, number: num, amount: '' }); 
    }
    updateMultiCartUI();
  }
  updateGridUI();
};

function updateGridUI() {
  document.querySelectorAll('.num-btn, .harup-btn').forEach(btn => btn.classList.remove('selected'));
  if (playMode === 'single' && singleSelection) {
    let btn = document.getElementById(`btn-${singleSelection.type}-${singleSelection.number}`);
    if(btn) btn.classList.add('selected');
  } else if (playMode === 'multi') {
    multiSelection.forEach(item => {
      let btn = document.getElementById(`btn-${item.type}-${item.number}`);
      if(btn) btn.classList.add('selected');
    });
  }
}

window.updateMultiCartUI = function() {
  const listDiv = document.getElementById('multiBetList');
  if (multiSelection.length === 0) {
    listDiv.innerHTML = '<div class="empty-slip">Tap numbers to add them to your slip</div>';
    document.getElementById('multiTotalAmt').innerText = "0";
    return;
  }

  let html = '';
  multiSelection.forEach((item, index) => {
    let typeText = item.type === 'main' ? 'Jodi' : 'Harup';
    html += `
      <div class="slip-item">
        <div class="slip-info">
          <span class="slip-title">${typeText} - ${item.number}</span>
        </div>
        <input type="number" class="slip-input" placeholder="₹ Amount" value="${item.amount}" oninput="updateCartAmount(${index}, this.value)" min="10">
        <button class="slip-del" onclick="selectNumber('${item.type}', '${item.number}')">X</button>
      </div>
    `;
  });
  listDiv.innerHTML = html;
  calculateMultiTotal();
};

window.updateCartAmount = function(index, value) {
  multiSelection[index].amount = value;
  calculateMultiTotal();
};

function calculateMultiTotal() {
  let total = 0;
  multiSelection.forEach(item => {
    let amt = parseInt(item.amount);
    if(!isNaN(amt) && amt > 0) total += amt;
  });
  document.getElementById('multiTotalAmt').innerText = total;
}

// ─── SUBMIT SINGLE BET ────────────────────────────────────────────────
window.submitSingleBet = async function() {
  if (!currentUser || !userData) return showToast('Please login first', 'error');
  if (!singleSelection) return showToast('❌ Please select a number first!', 'error');
  
  let amount = parseInt(document.getElementById('singleBetAmount').value);
  let minB = gameSettings.minBet || 10;
  if (isNaN(amount) || amount < minB) return showToast(`❌ Minimum bet amount is ₹${minB}`, 'error');
  if ((userData.walletBalance || 0) < amount) return showToast('❌ Insufficient Wallet Balance!', 'error');

  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];

    await addDoc(collection(db, 'bets'), {
      userId: currentUser.uid,
      userName: currentUser.displayName,
      userEmail: currentUser.email,
      type: singleSelection.type,
      number: singleSelection.number,
      amount: amount,
      status: 'pending',
      date: dateStr,
      time: timeStr,
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, 'users', currentUser.uid), {
      walletBalance: increment(-amount),
      totalBets: increment(1)
    });

    await addDoc(collection(db, 'wallet_transactions'), {
      userId: currentUser.uid,
      type: 'Bet Placed',
      amount: -amount,
      description: `Bet on ${singleSelection.type.toUpperCase()} #${singleSelection.number}`,
      createdAt: serverTimestamp()
    });

    showToast(`✅ Bet placed successfully on ${singleSelection.type.toUpperCase()} ${singleSelection.number}!`, 'success');
    addNotification('Bet Placed', `Your bet of ₹${amount} on ${singleSelection.type.toUpperCase()} #${singleSelection.number} has been placed`);
    
    document.getElementById('singleBetAmount').value = '';
    singleSelection = null;
    updateGridUI();
    document.getElementById('singleSelectedText').innerText = "Select a Jodi or Harup Number";
    
  } catch(e) {
    console.error(e);
    showToast("❌ Error placing bet.", 'error');
  }
};

// ─── SUBMIT MULTIPLE BETS ─────────────────────────────────────────────
window.submitMultiBets = async function() {
  if (!currentUser || !userData) return showToast('Please login first', 'error');
  if (multiSelection.length === 0) return showToast("❌ Bet slip is empty!", 'error');
  
  let totalAmt = parseInt(document.getElementById('multiTotalAmt').innerText);
  if (totalAmt === 0) return showToast("❌ Please enter amount for all bets!", 'error');
  if ((userData.walletBalance || 0) < totalAmt) return showToast("❌ Insufficient Wallet Balance!", 'error');

  let minB = gameSettings.minBet || 10;
  for (let item of multiSelection) {
    let amt = parseInt(item.amount);
    if (isNaN(amt) || amt < minB) return showToast(`❌ Minimum bet is ₹${minB}. Check amount for ${item.type} ${item.number}`, 'error');
  }

  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];

    for (let item of multiSelection) {
      await addDoc(collection(db, 'bets'), {
        userId: currentUser.uid,
        userName: currentUser.displayName,
        userEmail: currentUser.email,
        type: item.type,
        number: item.number,
        amount: parseInt(item.amount),
        status: 'pending',
        date: dateStr,
        time: timeStr,
        createdAt: serverTimestamp()
      });
    }

    await updateDoc(doc(db, 'users', currentUser.uid), {
      walletBalance: increment(-totalAmt),
      totalBets: increment(multiSelection.length)
    });

    await addDoc(collection(db, 'wallet_transactions'), {
      userId: currentUser.uid,
      type: 'Multiple Bets Placed',
      amount: -totalAmt,
      description: `Placed ${multiSelection.length} bets from cart`,
      createdAt: serverTimestamp()
    });

    showToast(`✅ All ${multiSelection.length} bets placed! Total Paid: ₹${totalAmt}`, 'success');
    addNotification('Bets Placed', `Placed ${multiSelection.length} bets successfully for ₹${totalAmt}`);
    
    multiSelection = [];
    updateMultiCartUI();
    updateGridUI();

  } catch(e) {
    console.error(e);
    showToast("❌ Error placing multiple bets.", 'error');
  }
};

// ─── LOAD ACTIVE BETS (UPDATED FOR NEW SCHEMA) ────────────────────────
async function loadActiveBets() {
  if (!currentUser) return;
  const snap = await getDocs(query(collection(db, 'bets'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'), limit(5)));
  const el = document.getElementById('activeBets');
  if (snap.empty) {
    el.innerHTML = `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><polygon points="5 3 19 12 5 21 5 3"/></svg><p>No active bets. <a onclick="showPage('play')" style="color:var(--gold);cursor:pointer">Play now!</a></p></div>`;
    return;
  }
  el.innerHTML = snap.docs.map(d => {
    const b = d.data();
    const typeLabel = b.type === 'main' ? 'JODI' : 'HARUP';
    return `<div class="bet-item">
      <div>
        <div class="bet-num">${typeLabel} - ${b.number}</div>
        <div class="bet-meta">${b.date || ''}</div>
      </div>
      <div style="text-align:right">
        <div class="bet-amount">₹${b.amount}</div>
        <span class="bet-status ${b.status === 'won' ? 'bs-win' : b.status === 'lost' ? 'bs-lose' : 'bs-pending'}">${b.status.toUpperCase()}</span>
      </div>
    </div>`;
  }).join('');
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────
async function loadTransactions() {
  if (!currentUser) return;
  const snap = await getDocs(query(collection(db, 'wallet_transactions'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'), limit(30)));
  const el = document.getElementById('transactionList');
  if (snap.empty) {
    el.innerHTML = `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg><p>No transactions yet</p></div>`;
    return;
  }
  el.innerHTML = snap.docs.map(d => {
    const t = d.data();
    const isCredit = t.amount > 0;
    return `<div class="tx-item ${isCredit ? 'tx-credit' : 'tx-debit'}">
      <div class="tx-icon">${isCredit ? '⬇️' : '⬆️'}</div>
      <div class="tx-info">
        <div class="tx-type">${t.type}</div>
        <div class="tx-date">${t.description || ''} • ${formatTimestamp(t.createdAt)}</div>
      </div>
      <div class="tx-amount">${isCredit ? '+' : ''}₹${Math.abs(t.amount)}</div>
    </div>`;
  }).join('');
}

// ─── HISTORY (UPDATED FOR NEW SCHEMA) ─────────────────────────────────
window.switchHistoryTab = (tab) => {
  currentHistoryTab = tab;
  document.querySelectorAll('.htab').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === tab));
  loadHistory(tab);
};

async function loadHistory(tab) {
  if (!currentUser) return;
  const el = document.getElementById('historyContent');
  el.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';

  if (tab === 'bets') {
    const snap = await getDocs(query(collection(db, 'bets'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'), limit(50)));
    if (snap.empty) { el.innerHTML = '<div class="empty-state"><p>No bet history</p></div>'; return; }
    el.innerHTML = snap.docs.map(d => {
      const b = d.data();
      const typeLabel = b.type === 'main' ? 'Jodi' : 'Harup';
      return `<div class="history-item">
        <div class="hi-left">
          <div class="hi-title">${typeLabel}: ${b.number}</div>
          <div class="hi-sub">${b.date} ${b.time}</div>
        </div>
        <div class="hi-right">
          <div class="hi-amount" style="color:${b.status === 'won' ? 'var(--green)' : 'var(--text-primary)'}">₹${b.amount}</div>
          <div class="hi-status" style="color:${b.status === 'won' ? 'var(--green)' : b.status === 'lost' ? 'var(--red)' : 'var(--gold)'}">${b.status.toUpperCase()}</div>
        </div>
      </div>`;
    }).join('');
  } else if (tab === 'payments') {
    const snap = await getDocs(query(collection(db, 'payments'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'), limit(30)));
    if (snap.empty) { el.innerHTML = '<div class="empty-state"><p>No payment history</p></div>'; return; }
    el.innerHTML = snap.docs.map(d => {
      const p = d.data();
      const colorMap = { approved: 'var(--green)', rejected: 'var(--red)', pending: 'var(--gold)' };
      return `<div class="history-item">
        <div class="hi-left">
          <div class="hi-title">Payment Request</div>
          <div class="hi-sub">${p.utrRef || 'No UTR'} • ${formatTimestamp(p.createdAt)}</div>
        </div>
        <div class="hi-right">
          <div class="hi-amount">₹${p.amount}</div>
          <div class="hi-status" style="color:${colorMap[p.status] || 'var(--text-muted)'}">${(p.status || 'pending').toUpperCase()}</div>
        </div>
      </div>`;
    }).join('');
  } else if (tab === 'results') {
    const snap = await getDocs(query(collection(db, 'results'), where('status', '==', 'closed'), orderBy('createdAt', 'desc'), limit(30)));
    if (snap.empty) { el.innerHTML = '<div class="empty-state"><p>No results yet</p></div>'; return; }
    el.innerHTML = snap.docs.map(d => {
      const r = d.data();
      return `<div class="history-item">
        <div class="hi-left">
          <div class="hi-title">Result: ${r.number} | Harup: ${r.harup}</div>
          <div class="hi-sub">${r.date} ${r.time}</div>
        </div>
        <div class="hi-right">
          <div class="hi-amount" style="font-family:var(--font-display);color:var(--gold)">${r.number}</div>
        </div>
      </div>`;
    }).join('');
  }
}

// ─── PAYMENT ──────────────────────────────────────────────────────────
window.setDepAmount = (n) => {
  document.getElementById('depositAmount').value = n;
  document.querySelectorAll('.dep-chip').forEach(c => c.classList.toggle('active', parseInt(c.textContent.replace('₹','')) === n));
  generateQR();
};

function generateQR() {
  const amount = document.getElementById('depositAmount')?.value || '';
  const upiId = paymentSettings.upiId || 'sattano1@upi';
  const name = encodeURIComponent(paymentSettings.payName || 'Satta No.1');
  const upiUrl = `upi://pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiUrl)}`;
  const container = document.getElementById('qrContainer');
  if (container) container.innerHTML = `<img src="${qrUrl}" alt="QR Code" style="width:100%;height:100%;object-fit:contain">`;
  document.getElementById('displayUpiId').textContent = upiId;
}
document.getElementById('depositAmount')?.addEventListener('input', generateQR);

window.openUPI = (app) => {
  const amount = document.getElementById('depositAmount')?.value || '';
  const upiId = paymentSettings.upiId || 'sattano1@upi';
  const name = encodeURIComponent(paymentSettings.payName || 'Satta No.1');
  const upiUrls = {
    gpay: `gpay://upi/pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR`,
    phonepe: `phonepe://pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR`,
    paytm: `paytmmp://pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR`,
    bhim: `upi://pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR`
  };
  window.location.href = upiUrls[app] || upiUrls.bhim;
};

window.submitPayment = async () => {
  if (!currentUser) return;
  const amount = parseInt(document.getElementById('depositAmount')?.value || 0);
  const ref = document.getElementById('paymentRef')?.value?.trim();
  if (amount < 10) return showToast('Enter a valid amount', 'error');
  if (!ref) return showToast('Please enter UTR/Transaction ID', 'error');

  try {
    await addDoc(collection(db, 'payments'), {
      userId: currentUser.uid,
      userName: currentUser.displayName,
      userEmail: currentUser.email,
      amount: amount,
      utrRef: ref,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    showToast('Payment request submitted! Awaiting admin approval.', 'success');
    document.getElementById('depositAmount').value = '';
    document.getElementById('paymentRef').value = '';
    addNotification('Payment Submitted', `₹${amount} payment request submitted with UTR: ${ref}`);
  } catch (e) {
    showToast('Failed to submit: ' + e.message, 'error');
  }
};

// ─── WITHDRAWAL ───────────────────────────────────────────────────────
window.submitWithdrawal = async () => {
  if (!currentUser) return;
  const amount = parseInt(document.getElementById('withdrawAmount')?.value || 0);
  const upi = document.getElementById('withdrawUpi')?.value?.trim();
  if (amount < 100) return showToast('Minimum withdrawal is ₹100', 'error');
  if (!upi) return showToast('Please enter your UPI ID', 'error');
  if ((userData?.walletBalance || 0) < amount) return showToast('Insufficient balance', 'error');

  try {
    await addDoc(collection(db, 'withdrawals'), {
      userId: currentUser.uid,
      userName: currentUser.displayName,
      amount, upiId: upi,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    showToast('Withdrawal request submitted!', 'success');
    document.getElementById('withdrawAmount').value = '';
    document.getElementById('withdrawUpi').value = '';
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  }
};

// ─── REFERRAL ─────────────────────────────────────────────────────────
async function loadReferralHistory() {
  if (!currentUser) return;
  const snap = await getDocs(query(collection(db, 'referrals'), where('referrerId', '==', currentUser.uid), orderBy('createdAt', 'desc')));
  const el = document.getElementById('referralHistory');
  if (snap.empty) { el.innerHTML = '<div class="empty-state"><p>No referrals yet. Share your code to earn!</p></div>'; return; }
  el.innerHTML = snap.docs.map(d => {
    const r = d.data();
    return `<div class="history-item">
      <div class="hi-left">
        <div class="hi-title">${r.newUserName}</div>
        <div class="hi-sub">${formatTimestamp(r.createdAt)}</div>
      </div>
      <div class="hi-right">
        <div class="hi-amount" style="color:var(--green)">+₹${r.bonusAmount}</div>
        <div class="hi-status" style="color:var(--green)">COMPLETED</div>
      </div>
    </div>`;
  }).join('');
}

window.copyRefCode = () => {
  navigator.clipboard.writeText(userData?.referralCode || '').then(() => showToast('Referral code copied!', 'success'));
};
window.copyRefLink = () => {
  const link = `${location.origin}?ref=${userData?.referralCode}`;
  navigator.clipboard.writeText(link).then(() => showToast('Referral link copied!', 'success'));
};
window.shareWhatsApp = () => {
  const link = `${location.origin}?ref=${userData?.referralCode}`;
  window.open(`https://wa.me/?text=${encodeURIComponent('Join Satta No.1 & earn bonus! Use my referral code: ' + userData?.referralCode + '\n' + link)}`);
};
window.shareTelegram = () => {
  const link = `${location.origin}?ref=${userData?.referralCode}`;
  window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join Satta No.1! Use my code: ' + userData?.referralCode)}`);
};

// ─── NOTIFICATIONS ────────────────────────────────────────────────────
async function addNotification(title, body) {
  if (!currentUser) return;
  await addDoc(collection(db, 'notifications'), {
    userId: currentUser.uid,
    title, body,
    read: false,
    createdAt: serverTimestamp()
  });
}

async function loadNotifications() {
  if (!currentUser) return;
  const snap = await getDocs(query(collection(db, 'notifications'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'), limit(30)));
  const el = document.getElementById('notificationList');
  if (snap.empty) {
    el.innerHTML = `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><p>No notifications</p></div>`;
    return;
  }
  el.innerHTML = snap.docs.map(d => {
    const n = d.data();
    return `<div class="history-item" style="${!n.read ? 'border-left: 3px solid var(--gold)' : ''}">
      <div class="hi-left">
        <div class="hi-title">${n.title}</div>
        <div class="hi-sub">${n.body}</div>
        <div class="hi-sub">${formatTimestamp(n.createdAt)}</div>
      </div>
    </div>`;
  }).join('');
}

// ─── TOAST ────────────────────────────────────────────────────────────
window.showToast = (msg, type = 'info') => {
  const icons = { success: '✅', error: '❌', info: '⚡' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toastContainer')?.appendChild(el);
  setTimeout(() => el.remove(), 4000);
};

// ─── UTILS ────────────────────────────────────────────────────────────
function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
