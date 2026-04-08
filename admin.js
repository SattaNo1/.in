


import { db } from './firebase.js';
import { collection, doc, getDoc, getDocs, updateDoc, query, where, increment, serverTimestamp, setDoc, onSnapshot, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 1. TAB SWITCHING LOGIC
// ==========================================
window.adminTab = function(tabName) {
  let tabs = document.getElementsByClassName('admin-tab');
  for (let i = 0; i < tabs.length; i++) tabs[i].classList.add('hidden');
  
  let btns = document.getElementsByClassName('snav-btn');
  for (let i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  
  document.getElementById('tab-' + tabName).classList.remove('hidden');
  event.currentTarget.classList.add('active');
};


// ==========================================
// 2. REAL-TIME DATA LOADERS (FIXED UNDEFINED ISSUE)
// ==========================================
function startAdminListeners() {
  
  // ---> A. LOAD ALL BETS & DASHBOARD RECENT BETS
  onSnapshot(query(collection(db, 'bets'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
    let betsHtml = '';
    let dashBetsHtml = '';
    let count = 0;

    if (snap.empty) {
      betsHtml = '<tr><td colspan="6" class="empty-row">No bets yet</td></tr>';
      dashBetsHtml = '<tr><td colspan="4" class="empty-row">No bets yet</td></tr>';
    } else {
      snap.forEach(docSnap => {
        let b = docSnap.data();

        // Naye aur Purane Format ko theek se dikhane ka Logic (Undefined Fix)
        let numDisp = b.type === 'main' ? b.number : (b.mainNumber || '--');
        let harupDisp = b.type === 'harup' ? b.number : (b.harupNumber || '--');
        
        let dateDisp = b.date || (b.createdAt?.toDate ? new Date(b.createdAt.toDate()).toLocaleDateString() : '--');
        let userDisp = b.userName || b.userEmail || 'User';

        // Status Colors
        let statusStyle = b.status === 'won' ? 'color:#28a745' : (b.status === 'lost' ? 'color:#dc3545' : 'color:#f5c518');

        // Main All Bets Table
        betsHtml += `<tr>
          <td>${dateDisp}</td>
          <td>${userDisp}</td>
          <td style="color:#f5c518; font-weight:bold;">${numDisp}</td>
          <td style="color:#f5c518; font-weight:bold;">${harupDisp}</td>
          <td>₹${b.amount}</td>
          <td style="${statusStyle}; text-transform:uppercase; font-size:12px; font-weight:bold;">${b.status}</td>
        </tr>`;

        // Dashboard Small Table (Only first 10 bets)
        if(count < 10) {
          let dashNumType = b.type === 'main' ? `Jodi: ${b.number}` : (b.type === 'harup' ? `Harup: ${b.number}` : `${b.mainNumber || b.harupNumber}`);
          dashBetsHtml += `<tr>
            <td>${userDisp}</td>
            <td style="color:#f5c518; font-weight:bold;">${dashNumType}</td>
            <td>₹${b.amount}</td>
            <td style="${statusStyle}; text-transform:uppercase; font-size:11px; font-weight:bold;">${b.status}</td>
          </tr>`;
        }
        count++;
      });
    }
    
    const betsTableEl = document.getElementById('betsTable');
    if(betsTableEl) betsTableEl.innerHTML = betsHtml;
    
    const dashBetsEl = document.getElementById('dashRecentBets');
    if(dashBetsEl) dashBetsEl.innerHTML = dashBetsHtml;
  });


  // ---> B. LOAD PAYMENTS (WITH APPROVE/REJECT BUTTONS)
  onSnapshot(query(collection(db, 'payments'), orderBy('createdAt', 'desc'), limit(50)), (snap) => {
    let payHtml = '';
    let dashPayHtml = '';
    let count = 0;
    let pendingCount = 0;

    if (snap.empty) {
      payHtml = '<tr><td colspan="6" class="empty-row">No payments found</td></tr>';
      dashPayHtml = '<tr><td colspan="4" class="empty-row">No pending payments</td></tr>';
    } else {
      snap.forEach(docSnap => {
        let p = docSnap.data();
        let dateDisp = p.createdAt?.toDate ? new Date(p.createdAt.toDate()).toLocaleDateString() : '--';
        let userDisp = p.userName || p.userEmail || 'User';

        if(p.status === 'pending') pendingCount++;

        let statusColor = p.status === 'approved' ? '#28a745' : (p.status === 'rejected' ? '#dc3545' : '#f5c518');

        payHtml += `<tr>
          <td>${dateDisp}</td>
          <td>${userDisp}</td>
          <td style="font-weight:bold;">₹${p.amount}</td>
          <td>${p.utrRef || '--'}</td>
          <td style="color:${statusColor}; text-transform:uppercase; font-size:12px; font-weight:bold;">${p.status}</td>
          <td>
            ${p.status === 'pending' ?
              `<button onclick="approvePayment('${docSnap.id}', '${p.userId}', ${p.amount})" style="background:#28a745; color:#fff; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-right:5px;">Approve</button>
               <button onclick="rejectPayment('${docSnap.id}')" style="background:#dc3545; color:#fff; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Reject</button>`
              : '--'
            }
          </td>
        </tr>`;

        // Dashboard Pending Payments (First 10 pending only)
        if(p.status === 'pending' && count < 10) {
          dashPayHtml += `<tr>
            <td>${userDisp}</td>
            <td style="font-weight:bold;">₹${p.amount}</td>
            <td>${p.utrRef || '--'}</td>
            <td>
              <button onclick="approvePayment('${docSnap.id}', '${p.userId}', ${p.amount})" style="background:#28a745; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:11px; margin-right:4px;">Approve</button>
              <button onclick="rejectPayment('${docSnap.id}')" style="background:#dc3545; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:11px;">Reject</button>
            </td>
          </tr>`;
          count++;
        }
      });
    }

    const payTableEl = document.getElementById('paymentsTable');
    if(payTableEl) payTableEl.innerHTML = payHtml;

    const dashPayEl = document.getElementById('dashPendingPay');
    if(dashPayEl) dashPayEl.innerHTML = dashPayHtml === '' ? '<tr><td colspan="4" class="empty-row">No pending payments</td></tr>' : dashPayHtml;

    const pendingEl = document.getElementById('statPendingPayments');
    if(pendingEl) pendingEl.innerText = pendingCount;
  });


  // ---> C. LOAD USERS LIST
  onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
    let userHtml = '';
    const totalUsersEl = document.getElementById('statTotalUsers');
    if(totalUsersEl) totalUsersEl.innerText = snap.size;

    if (snap.empty) {
      userHtml = '<tr><td colspan="6" class="empty-row">No users found</td></tr>';
    } else {
      snap.forEach(docSnap => {
        let u = docSnap.data();
        let dateDisp = u.createdAt?.toDate ? new Date(u.createdAt.toDate()).toLocaleDateString() : '--';
        userHtml += `<tr>
          <td>${u.name || 'User'}</td>
          <td>${u.email || '--'}</td>
          <td style="color:#28a745; font-weight:bold;">₹${u.walletBalance || 0}</td>
          <td>${dateDisp}</td>
          <td>${u.totalBets || 0}</td>
          <td>--</td>
        </tr>`;
      });
    }
    const userTableEl = document.getElementById('usersTable');
    if(userTableEl) userTableEl.innerHTML = userHtml;
  });


  // ---> D. LOAD PAST RESULTS
  onSnapshot(query(collection(db, 'results'), orderBy('createdAt', 'desc'), limit(30)), (snap) => {
    let resHtml = '';
    if (snap.empty) {
      resHtml = '<tr><td colspan="6" class="empty-row">No results yet</td></tr>';
    } else {
      snap.forEach(docSnap => {
        let r = docSnap.data();
        resHtml += `<tr>
          <td>${r.date || '--'}</td>
          <td>${r.time || '--'}</td>
          <td style="color:#f5c518; font-weight:bold;">${r.number || '--'}</td>
          <td style="color:#f5c518; font-weight:bold;">${r.harup || '--'}</td>
          <td style="color:#28a745;">CLOSED</td>
          <td>₹${r.totalPayout || 0}</td>
        </tr>`;
      });
    }
    const resultsTableEl = document.getElementById('resultsTable');
    if(resultsTableEl) resultsTableEl.innerHTML = resHtml;
  });
}


// ==========================================
// 3. PAYMENT APPROVAL LOGIC
// ==========================================
window.approvePayment = async function(docId, userId, amount) {
  if(!confirm(`Approve payment of ₹${amount}?`)) return;
  try {
    await updateDoc(doc(db, "payments", docId), { status: "approved" });
    
    // Add money to user wallet
    await updateDoc(doc(db, "users", userId), { 
      walletBalance: increment(amount) 
    });

    // Save transaction history
    await addDoc(collection(db, "wallet_transactions"), {
      userId: userId,
      type: "Deposit Approved",
      amount: amount,
      description: "Admin approved deposit",
      createdAt: serverTimestamp()
    });

    alert("✅ Payment Approved! Money added to user wallet.");
  } catch(e) {
    console.error(e); alert("❌ Error approving payment.");
  }
};

window.rejectPayment = async function(docId) {
  if(!confirm("Reject this payment?")) return;
  try {
    await updateDoc(doc(db, "payments", docId), { status: "rejected" });
    alert("❌ Payment Rejected.");
  } catch(e) {
    console.error(e); alert("❌ Error rejecting payment.");
  }
};


// ==========================================
// 4. RESULT DECLARE & AUTO-CALCULATE WINNERS
// ==========================================
window.addResult = async function() {
  const winNumber = document.getElementById('resultNumber').value;
  const winHarup = document.getElementById('resultHarup').value;

  if (!winNumber && !winHarup) {
    alert("❌ Please enter Main Number or Harup Number!");
    return;
  }

  document.body.style.cursor = "wait";

  try {
    const settingsRef = doc(db, "settings", "game");
    const settingsSnap = await getDoc(settingsRef);
    
    let jodiMultiplier = 90; 
    let harupMultiplier = 9; 

    if (settingsSnap.exists()) {
      jodiMultiplier = settingsSnap.data().multiplier || 90;
      harupMultiplier = settingsSnap.data().harupMult || 9;
    }

    const betsRef = collection(db, "bets");
    const q = query(betsRef, where("status", "==", "pending"));
    const querySnapshot = await getDocs(q);

    let totalWinners = 0;
    let totalPayout = 0;

    for (const betDoc of querySnapshot.docs) {
      const bet = betDoc.data();
      let isWinner = false;
      let winAmount = 0;

      if (bet.type === "main" && bet.number == winNumber) {
        isWinner = true;
        winAmount = bet.amount * jodiMultiplier; 
      } 
      else if (bet.type === "harup" && bet.number == winHarup) {
        isWinner = true;
        winAmount = bet.amount * harupMultiplier; 
      }

      if (isWinner) {
        totalWinners++;
        totalPayout += winAmount;

        await updateDoc(doc(db, "bets", betDoc.id), {
          status: "won",
          wonAmount: winAmount,
          updatedAt: serverTimestamp()
        });

        // Add winning amount to user's wallet
        const userRef = doc(db, "users", bet.userId);
        await updateDoc(userRef, {
          walletBalance: increment(winAmount)
        });

        await addDoc(collection(db, "wallet_transactions"), {
          userId: bet.userId,
          type: "Bet Won",
          amount: winAmount,
          description: `Won on ${bet.type.toUpperCase()} #${bet.number}`,
          createdAt: serverTimestamp()
        });

      } else {
        await updateDoc(doc(db, "bets", betDoc.id), {
          status: "lost",
          wonAmount: 0,
          updatedAt: serverTimestamp()
        });
      }
    }

    await setDoc(doc(collection(db, "results")), {
        number: winNumber || "--",
        harup: winHarup || "-",
        date: document.getElementById('resultDate').value || new Date().toISOString().split('T')[0],
        time: document.getElementById('resultTime').value || "N/A",
        totalWinners: totalWinners,
        totalPayout: totalPayout,
        status: "closed",
        createdAt: serverTimestamp()
    });

    document.body.style.cursor = "default";
    alert(`✅ Result Declared Successfully!\n🏆 Total Winners: ${totalWinners}\n💰 Total Auto-Payout: ₹${totalPayout}`);
    
    document.getElementById('resultNumber').value = '';
    document.getElementById('resultHarup').value = '';
    
  } catch (error) {
    document.body.style.cursor = "default";
    console.error("Error declaring result: ", error);
    alert("❌ Error declaring result. Check console for details.");
  }
};


// ==========================================
// 5. SAVE GAME SETTINGS
// ==========================================
window.saveGameSettings = async function() {
  const jodiMult = parseInt(document.getElementById('settingMultiplier').value);
  const harupMult = parseInt(document.getElementById('settingHarupMult').value);
  const minBet = parseInt(document.getElementById('settingMinBet').value);
  const refBonus = parseInt(document.getElementById('settingRefBonus').value);

  try {
    await setDoc(doc(db, "settings", "game"), {
      multiplier: jodiMult,
      harupMult: harupMult,
      minBet: minBet,
      refBonus: refBonus,
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    alert("✅ Game Settings Saved Successfully!");
  } catch (error) {
    console.error("Settings save error:", error);
    alert("❌ Failed to save settings.");
  }
};


// ==========================================
// 6. WALLET MANUAL ADJUSTMENT
// ==========================================
window.adjustWallet = async function() { 
  const userId = document.getElementById('adjUserId').value;
  const amount = parseInt(document.getElementById('adjAmount').value);
  
  if(!userId || isNaN(amount)) { 
    alert("❌ Enter valid User Email/ID and amount"); 
    return; 
  }
  
  try {
    await updateDoc(doc(db, "users", userId), { 
      walletBalance: increment(amount) 
    });
    alert(`✅ Wallet successfully adjusted by ₹${amount}`);
  } catch(e) {
    alert("❌ Error adjusting wallet. Make sure Firebase UID is correct.");
  }
};


// INITIALIZE LISTENERS ON LOAD
window.addEventListener('DOMContentLoaded', () => {
  // We only start loading data if the admin panel is visible 
  // (i.e. they passed the password screen). 
  // For safety, let's bind it to the Login button in admin.html
  const loginBtn = document.querySelector('.login-btn-custom');
  if(loginBtn) {
    const originalCheckPass = window.checkPassword;
    window.checkPassword = function() {
      var passInput = document.getElementById('adminPassword').value;
      if (passInput === 'No1Satta@1998') {
        document.getElementById('adminLoginPage').classList.add('hidden');
        document.getElementById('adminPanel').classList.remove('hidden');
        startAdminListeners(); // DATA TABHI LOAD HOGA JAB PASSWORD SAHI HOGA!
      } else {
        document.getElementById('errorMsg').style.display = 'block';
      }
    };
  } else {
    startAdminListeners();
  }
});
