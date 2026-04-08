# Satta No.1 — Complete Gaming Web App

## 🚀 Deployment Guide (GitHub Pages)

### Step 1: Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Open your project: `satta-28662`
3. Enable **Authentication** → Google Sign-In
4. Enable **Firestore Database** (start in test mode)
5. Paste `firestore.rules` content into Firestore Rules
6. Add your GitHub Pages URL to **Authorized Domains** in Firebase Auth

### Step 2: GitHub Pages Setup
1. Create a GitHub repository: `satta-no1`
2. Upload ALL files from this folder
3. Go to Settings → Pages → Source: main branch → root
4. Your app will be live at: `https://yourusername.github.io/satta-no1/`

### Step 3: Admin Setup
1. Open `https://yourusername.github.io/satta-no1/admin.html`
2. Sign in with your Google account
3. Go to Settings → Admin Emails → Add your email → Save
4. From now on, only listed emails can access admin

---

## 📁 File Structure
```
satta-no1/
├── index.html          ← Main user app
├── admin.html          ← Admin panel (hidden)
├── manifest.json       ← PWA config
├── service-worker.js   ← Offline support
├── firestore.rules     ← Security rules
├── css/
│   ├── main.css        ← User app styles
│   └── admin.css       ← Admin panel styles
├── js/
│   ├── firebase.js     ← Firebase config
│   ├── app.js          ← User app logic
│   └── admin.js        ← Admin logic
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## ✅ Features Included
- Gmail Google Sign-In
- Auto user profile creation
- Live wallet balance (real-time)
- Number grid 1-100 + Harup 1-9
- Bet placement with wallet deduction
- UPI payment with QR code
- 4 UPI app shortcuts (GPay, PhonePe, Paytm, BHIM)
- Payment approval system
- Auto wallet credit on approval
- Auto win/lose calculation on result
- Auto payout to winners
- Referral code system (FirstName + 4 digits)
- Referral link sharing (WhatsApp, Telegram)
- Referral bonus auto-credit
- Full history (bets, payments, results)
- Notification system
- PWA installable (Add to Home Screen)
- Offline basic support
- Admin panel at /admin.html
- Admin: add results → auto calculate winners
- Admin: approve/reject payments
- Admin: wallet adjustment
- Admin: daily profit reports
- Admin: JSON/CSV export + backup
- Admin: game settings (multiplier, min bet)
- Admin: UPI settings
- Firebase security rules

---

## 🔐 Security
- Google OAuth only (no passwords)
- Firestore security rules prevent unauthorized access
- Admin panel is NOT linked from user app
- Each user can only access their own data
- Admin-only result & payment management
