import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, setPersistence, browserLocalPersistence, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, getDoc, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDNq260cSPIXAgbLdYAAU1pvpB-mnHRiZw",
    authDomain: "railway-shifts.firebaseapp.com",
    projectId: "railway-shifts",
    storageBucket: "railway-shifts.firebasestorage.app",
    messagingSenderId: "604151596005",
    appId: "1:604151596005:web:e77d55a4fbc56ea63d650c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.error("Persistence error:", err);
});

enableIndexedDbPersistence(db).catch((err) => {
    console.log("Offline persistence not available", err);
});

window.currentUser = null;
window.isUserInstructor = false;
const OWNER_UID = "ShasTZArs9Uqddy973BmlW4oP7T2";

const PRESET_NALT_MINUTES = [0, 40, 45, 60, 90, 120, 270];

window.getNaltFieldValue = function(type) {
    const select = document.getElementById('selectNalt' + type);
    const customInput = document.getElementById('customNalt' + type);
    if (!select) return 0;
    if (select.value === 'custom') {
        return parseInputToMinutes(customInput ? customInput.value : '');
    }
    return Number(select.value) || 0;
};

window.setNaltFieldUI = function(type, mins) {
    const select = document.getElementById('selectNalt' + type);
    const customInput = document.getElementById('customNalt' + type);
    if (!select) return;
    
    mins = Number(mins) || 0;
    if (PRESET_NALT_MINUTES.includes(mins)) {
        select.value = String(mins);
        if (customInput) {
            customInput.style.display = 'none';
            customInput.value = '';
        }
    } else {
        select.value = 'custom';
        if (customInput) {
            customInput.style.display = 'block';
            customInput.value = formatMinutesToDisplay(mins);
        }
    }
};

window.triggerGoogleSignIn = async function() {
    try {
        await signInWithPopup(auth, googleProvider);
    } catch (error) {
        console.error("שגיאה בתהליך ההתחברות:", error);
        if (error.code === 'auth/popup-blocked') {
            alert('החלון הקופץ נחסם על ידי הדפדפן. אנא אפשר חלונות קופצים עבור אתר זה.');
        }
    }
};

async function checkInstructorPermission(uid) {
    try {
        if (uid === OWNER_UID) {
            const localOverride = localStorage.getItem('owner_instructor_override');
            if (localOverride !== null) {
                window.isUserInstructor = (localOverride === 'true');
            } else {
                window.isUserInstructor = true;
            }
            return;
        }
        const instructorDocRef = doc(db, 'instructors', uid);
        const instructorSnap = await getDoc(instructorDocRef);
        
        if (instructorSnap.exists() && instructorSnap.data().active === true) {
            window.isUserInstructor = true;
        } else {
            window.isUserInstructor = false;
        }
    } catch (e) {
        console.error("שגיאה בבדיקת הרשאות מדריך:", e);
        window.isUserInstructor = false;
    }
}

window.toggleOwnerInstructorMode = function(isChecked) {
    if (!window.currentUser || window.currentUser.uid !== OWNER_UID) return;
    window.isUserInstructor = isChecked;
    localStorage.setItem('owner_instructor_override', isChecked ? 'true' : 'false');
    if (typeof updateActiveShiftUI === 'function') {
        updateActiveShiftUI();
    }
};

async function checkIfGoogleDefaultAvatar(url) {
    if (!url) return true;
    if (url.includes('default-user')) return true;

    try {
        // בדיקת גודל קובץ: תמונת אות ברירת מחדל ~3KB, תמונה אמיתית בד"כ 8KB+
        const response = await fetch(url, { referrerPolicy: 'no-referrer' });
        if (!response.ok) return true;
        const blob = await response.blob();
        // סף 5000 בייטים (5KB) – מתחת: ברירת מחדל, מעל: תמונה אמיתית
        return blob.size < 5000;
    } catch (e) {
        // בשגיאת רשת – נניח שהיא תמונה אמיתית ונציג אותה
        return false;
    }
}



onAuthStateChanged(auth, async (user) => {
    window.currentUser = user;
    const btnText = document.getElementById('authBtnText');
    const authContainer = document.getElementById('headerAuthContainer');
    const authCircle = document.getElementById('headerAuthCircle');

    if (user) {
        const displayName = user.displayName ? user.displayName.split(' ')[0] : 'מחובר';
        btnText.textContent = displayName;
        authContainer.classList.add('logged-in');

        if (authCircle) {
            if (user.photoURL) {
                const cached = localStorage.getItem(`gphoto_${user.uid}`);
                if (cached === '0') {
                    // Cached: confirmed real photo → show it
                    authCircle.innerHTML = `<img src="${user.photoURL}" alt="" class="header-auth-avatar-img" referrerpolicy="no-referrer">`;
                } else {
                    // Default icon (either cached as default, or no cache yet)
                    authCircle.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
                    // If no cache yet, run canvas check in background for future reloads
                    if (cached === null) {
                        checkIfGoogleDefaultAvatar(user.photoURL).then(isDefault => {
                            localStorage.setItem(`gphoto_${user.uid}`, isDefault ? '1' : '0');
                            if (!isDefault) {
                                const circle = document.getElementById('headerAuthCircle');
                                if (circle) circle.innerHTML = `<img src="${user.photoURL}" alt="" class="header-auth-avatar-img" referrerpolicy="no-referrer">`;
                            }
                        });
                    }
                }
            } else {
                authCircle.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
            }
        }
        
        await checkInstructorPermission(user.uid);
        await handleUserAuthenticationSync(user.uid);

        try {
            await setDoc(doc(db, 'app_users', user.uid), {
                email: user.email || 'לא ידוע',
                name: user.displayName || 'משתמש',
                photoURL: user.photoURL || '',
                lastLogin: new Date().toISOString()
            }, { merge: true });
        } catch (err) {
            console.error("Error logging user:", err);
        }

    } else {
        window.isUserInstructor = false;
        btnText.textContent = 'לא מחובר';
        authContainer.classList.remove('logged-in');
        if (authCircle) {
            authCircle.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
        }
        loadLocalShifts();
    }
});

async function handleUserAuthenticationSync(uid) {
    try {
        const shiftsRef = collection(db, 'users', uid, 'shifts');
        const snapshot = await getDocs(shiftsRef);
        let cloudShifts = [];
        snapshot.forEach(docSnap => {
            cloudShifts.push(docSnap.data());
        });

        let localShifts = JSON.parse(localStorage.getItem('railway_shifts') || '[]');
        let lastUser = localStorage.getItem('railway_last_user');
        let isSameUser = (lastUser === uid);

        if (isSameUser) {
            window.shifts = cloudShifts.length > 0 ? cloudShifts : localShifts;
            autoSortShiftsArray(window.shifts);
            localStorage.setItem('railway_shifts', JSON.stringify(window.shifts));
            localStorage.setItem('railway_last_user', uid);
            refreshUIAfterSync();
            return;
        }

        if (cloudShifts.length > 0 && localShifts.length === 0) {
            window.shifts = cloudShifts;
            autoSortShiftsArray(window.shifts);
            localStorage.setItem('railway_shifts', JSON.stringify(window.shifts));
            localStorage.setItem('railway_last_user', uid);
            refreshUIAfterSync();
        }
        else if (cloudShifts.length > 0 && localShifts.length > 0) {
            showSmartAlertDialog(
                'התנגשות נתונים',
                'נמצאו משמרות מקומיות במכשיר זה וגם משמרות שמורות בענן. האם ברצונך לטעון את נתוני הענן (ולמחוק את המידע המקומי), או להשאיר את המידע המקומי?',
                'טען ענן (דרוס מקומי)',
                'השאר מידע מקומי',
                () => {
                    window.shifts = cloudShifts;
                    autoSortShiftsArray(window.shifts);
                    localStorage.setItem('railway_shifts', JSON.stringify(window.shifts));
                    localStorage.setItem('railway_last_user', uid);
                    refreshUIAfterSync();
                },
                () => {
                    window.shifts = localShifts;
                    localStorage.setItem('railway_last_user', uid);
                    (async () => {
                        for (let shift of localShifts) {
                            await setDoc(doc(db, 'users', uid, 'shifts', String(shift.id)), shift);
                        }
                    })();
                    refreshUIAfterSync();
                }
            );
        }
        else if (cloudShifts.length === 0 && localShifts.length > 0) {
            showSmartAlertDialog(
                'גיבוי נתונים מקומיים',
                'נמצאו משמרות שהוזנו במכשיר זה. האם ברצונך לגבות אותן אל תוך חשבון ה-Google שלך?',
                'גבה לענן',
                'דלג',
                async () => {
                    for (let shift of localShifts) {
                        await setDoc(doc(db, 'users', uid, 'shifts', String(shift.id)), shift);
                    }
                    window.shifts = localShifts;
                    localStorage.setItem('railway_last_user', uid);
                    refreshUIAfterSync();
                },
                () => {
                    window.shifts = localShifts;
                    localStorage.setItem('railway_last_user', uid);
                    refreshUIAfterSync();
                }
            );
        }
        else {
            window.shifts = [];
            localStorage.setItem('railway_last_user', uid);
            refreshUIAfterSync();
        }
    } catch (e) {
        console.error("Sync error during auth:", e);
        loadLocalShifts();
    }
}

function refreshUIAfterSync() {
    if (typeof renderShifts === 'function' && currentView === 'history') {
        renderShifts();
    }
    if (typeof updateActiveShiftUI === 'function') {
        updateActiveShiftUI();
    }
}

window.goToProfileView = function() {
    window.closeUserMenu();
    if (window.currentUser) {
        document.getElementById('profileName').textContent = window.currentUser.displayName || 'משתמש רכבת';
        document.getElementById('profileEmail').textContent = window.currentUser.email || 'לא זמין';
        
        const ownerBtn = document.getElementById('ownerAdminBtnContainer');
        const ownerToggleContainer = document.getElementById('ownerInstructorToggleContainer');
        const ownerGitBtn = document.getElementById('ownerGitCommandsContainer');

        if (window.currentUser.uid === OWNER_UID) {
            ownerBtn.style.display = 'block';
            ownerToggleContainer.style.display = 'block';
            if (ownerGitBtn) ownerGitBtn.style.display = 'block';
            document.getElementById('ownerInstructorToggle').checked = window.isUserInstructor;
        } else {
            ownerBtn.style.display = 'none';
            ownerToggleContainer.style.display = 'none';
            if (ownerGitBtn) ownerGitBtn.style.display = 'none';
        }

        populateProfileMonthSelector();
        updateProfileSummaryData();
    }
    navigateTo('profile');
};

window.openSettingsModal = function() {
    window.closeUserMenu();
    document.getElementById('settingsModal').classList.add('open');
};

window.closeSettingsModal = function() {
    document.getElementById('settingsModal').classList.remove('open');
    window.closeUserMenu();
};

window.confirmSignOut = function() {
    window.closeUserMenu();

    showSmartAlertDialog(
        'התנתקות מהמערכת',
        'האם אתה בטוח שברצונך להתנתק? (הנתונים במכשיר יאופסו, אך ישארו שמורים בענן).',
        'התנתק',
        'ביטול',
        async () => {
            try {
                await signOut(auth);
                window.shifts = [];
                window.isUserInstructor = false;
                localStorage.removeItem('railway_shifts');
                localStorage.removeItem('railway_last_user');
                refreshUIAfterSync();
            } catch (error) {
                console.error("Sign out error:", error);
            }
        },
        () => {}
    );
};

window.loadLocalShifts = function() {
    window.shifts = JSON.parse(localStorage.getItem('railway_shifts') || '[]');
    if (typeof renderShifts === 'function' && currentView === 'history') {
        renderShifts();
    }
    if (typeof updateActiveShiftUI === 'function') {
        updateActiveShiftUI();
    }
};

window.saveShiftToCloudAndLocal = async function(shiftObj) {
    localStorage.setItem('railway_shifts', JSON.stringify(window.shifts));
    
    if (window.currentUser) {
        localStorage.setItem('railway_last_user', window.currentUser.uid);
        try {
            await setDoc(doc(db, 'users', window.currentUser.uid, 'shifts', String(shiftObj.id)), shiftObj);
        } catch (e) {
            console.error("Cloud save failed:", e);
        }
    }
};

window.deleteShiftFromCloudAndLocal = async function(shiftId) {
    localStorage.setItem('railway_shifts', JSON.stringify(window.shifts));
    
    if (window.currentUser) {
        try {
            await deleteDoc(doc(db, 'users', window.currentUser.uid, 'shifts', String(shiftId)));
        } catch (e) {
            console.error("Cloud delete failed:", e);
        }
    }
};

window.loadAdminUsersList = async function() {
    const listContainer = document.getElementById('adminUsersList');
    if (!listContainer) return;

    if (!listContainer.querySelector('.admin-user-card')) {
        listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">טוען משתמשים...</div>';
    }

    try {
        const usersSnap = await getDocs(collection(db, 'app_users'));
        const instructorsSnap = await getDocs(collection(db, 'instructors'));

        let instructorsMap = {};
        instructorsSnap.forEach(docSnap => {
            instructorsMap[docSnap.id] = docSnap.data().active === true;
        });

        let usersData = [];
        usersSnap.forEach(docSnap => {
            const uId = docSnap.id;
            if (uId === OWNER_UID) return;
            usersData.push({ id: uId, ...docSnap.data(), isInstructor: Boolean(instructorsMap[uId]) });
        });

        if (usersData.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">אין עדיין משתמשים נוספים במערכת</div>';
            return;
        }

        listContainer.innerHTML = usersData.map(u => buildAdminUserCard(u)).join('');

    } catch (err) {
        console.error("Error loading users:", err);
        listContainer.innerHTML = '<div style="text-align: center; color: var(--accent-red); padding: 20px;">שגיאה בטעינת משתמשים</div>';
    }
};

function buildEmailMaskHTML(email) {
    if (!email || !email.includes('@')) {
        return `<span class="admin-unified-email">${email || 'לא ידוע'}</span>`;
    }
    const atIdx = email.indexOf('@');
    const local = email.substring(0, atIdx);
    const domain = email.substring(atIdx);
    
    let keepStart, keepEnd;
    if (local.length <= 3) {
        keepStart = 1;
        keepEnd = 0;
    } else {
        keepStart = Math.min(3, Math.ceil(local.length / 3));
        keepEnd = local.length > 6 ? 2 : 1;
    }
    
    const prefix = local.substring(0, keepStart);
    const hiddenPart = local.substring(keepStart, local.length - keepEnd);
    const suffix = local.substring(local.length - keepEnd) + domain;
    const stars = '*'.repeat(Math.max(1, hiddenPart.length));

    return `<span class="admin-unified-email"><span class="email-prefix">${prefix}</span><span class="censored-mask" data-stars="${stars}">${hiddenPart}</span><span class="email-suffix">${suffix}</span></span>`;
}

function buildAdminUserCard(user) {
    const roleLabel = user.isInstructor ? 'מדריך' : 'משתמש רגיל';
    const roleBadgeBg = user.isInstructor ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.1)';
    const roleColor = user.isInstructor ? 'var(--accent-green)' : 'var(--text-muted)';
    const emailSafe = (user.email || '').replace(/'/g, "\\'");
    const uidSafe = user.id.replace(/'/g, "\\'");
    const emailMaskHTML = buildEmailMaskHTML(user.email || 'לא ידוע');

    const copySvg = '<svg class="svg-icon" width="13" height="13" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
    const gearOutlineSvg = '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>';
    const capSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>';

    return `
        <div class="admin-user-card" data-uid="${user.id}">
            <div class="admin-user-header" onclick="toggleAdminCard('${uidSafe}')">
                <div class="admin-email-wrap">
                    ${emailMaskHTML}
                    <button class="btn-secondary copy-icon-btn admin-email-copy-btn" onclick="navigator.clipboard.writeText('${emailSafe}'); event.stopPropagation();" title="העתק מייל">${copySvg}</button>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="admin-indicator-icon ${user.isInstructor ? 'active-instructor' : 'inactive-user'}" title="${roleLabel}">
                        ${capSvg}
                    </span>
                    <svg class="admin-chevron" width="18" height="18" viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
                </div>
            </div>
            <div class="admin-user-body" id="admin-body-${user.id}">
                <div class="admin-user-row2">
                    <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                        <span style="font-size: 0.72rem; color: var(--text-muted); font-family: monospace; direction: ltr; overflow: hidden; text-overflow: ellipsis;">${user.id}</span>
                        <button class="btn-secondary copy-icon-btn" onclick="navigator.clipboard.writeText('${uidSafe}'); event.stopPropagation();" title="העתק UID">${copySvg}</button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="admin-role-badge" style="font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: ${roleBadgeBg}; color: ${roleColor}; white-space: nowrap;">
                            ${roleLabel}
                        </span>
                        <button class="admin-perm-btn" onclick="openPermModal('${uidSafe}', '${emailSafe}', ${user.isInstructor}); event.stopPropagation();" title="ניהול הרשאה">
                            ${gearOutlineSvg}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

window.toggleAdminCard = function(uid) {
    const allBodies = document.querySelectorAll('.admin-user-body');
    const allCards = document.querySelectorAll('.admin-user-card');
    const targetBody = document.getElementById('admin-body-' + uid);
    const targetCard = document.querySelector('.admin-user-card[data-uid="' + uid + '"]');
    if (!targetCard || !targetBody) return;

    const isOpen = targetCard.classList.contains('open');

    allBodies.forEach(b => { b.style.maxHeight = '0'; });
    allCards.forEach(c => c.classList.remove('open'));

    if (!isOpen) {
        targetCard.classList.add('open');
        targetBody.style.maxHeight = targetBody.scrollHeight + 'px';
    }
};

window.openPermModal = function(uid, email, isInstructor) {
    document.getElementById('permModalEmail').textContent = email;
    const toggle = document.getElementById('permToggle');
    toggle.checked = isInstructor;
    document.getElementById('adminPermModal').setAttribute('data-uid', uid);
    document.getElementById('adminPermModal').classList.add('open');
    updatePermToggleLabel(isInstructor);
};

window.closePermModal = function() {
    document.getElementById('adminPermModal').classList.remove('open');
};

window.onPermToggleChange = function(isChecked) {
    updatePermToggleLabel(isChecked);
};

function updatePermToggleLabel(isInstructor) {
    const labelInstructor = document.getElementById('permLabelRight');
    const labelRegular = document.getElementById('permLabelLeft');
    if (isInstructor) {
        labelRegular.style.opacity = '0.35';
        labelRegular.style.fontWeight = '400';
        labelRegular.style.color = 'var(--text-main)';
        labelInstructor.style.opacity = '1';
        labelInstructor.style.fontWeight = '700';
        labelInstructor.style.color = 'var(--accent-green)';
    } else {
        labelRegular.style.opacity = '1';
        labelRegular.style.fontWeight = '700';
        labelRegular.style.color = 'var(--text-main)';
        labelInstructor.style.opacity = '0.35';
        labelInstructor.style.fontWeight = '400';
        labelInstructor.style.color = 'var(--text-main)';
    }
}

window.savePermChange = async function() {
    const modal = document.getElementById('adminPermModal');
    const uid = modal.getAttribute('data-uid');
    const isChecked = document.getElementById('permToggle').checked;
    
    closePermModal();

    // עדכון מיידי של הכרטיס ב-DOM ללא הבהוב או סגירת כרטיסים
    const card = document.querySelector(`.admin-user-card[data-uid="${uid}"]`);
    if (card) {
        const badge = card.querySelector('.admin-role-badge');
        if (badge) {
            badge.textContent = isChecked ? 'מדריך' : 'משתמש רגיל';
            badge.style.background = isChecked ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.1)';
            badge.style.color = isChecked ? 'var(--accent-green)' : 'var(--text-muted)';
        }
        const cap = card.querySelector('.admin-indicator-icon');
        if (cap) {
            cap.className = `admin-indicator-icon ${isChecked ? 'active-instructor' : 'inactive-user'}`;
            cap.title = isChecked ? 'מדריך' : 'משתמש רגיל';
        }
        const permBtn = card.querySelector('.admin-perm-btn');
        if (permBtn) {
            const currentEmail = card.querySelector('.admin-unified-email')?.textContent || '';
            permBtn.setAttribute('onclick', `openPermModal('${uid}', '${currentEmail.replace(/'/g, "\\'")}', ${isChecked}); event.stopPropagation();`);
        }
    }

    try {
        await setDoc(doc(db, 'instructors', uid), { active: isChecked }, { merge: true });
    } catch (err) {
        console.error("Error updating instructor:", err);
        showErrorDialog('שגיאה בעדכון ההרשאה');
        loadAdminUsersList();
    }
};



(function generateAppIcon() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#132247');
    grad.addColorStop(1, '#060b16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    function drawPoly(points, fillStyle, strokeStyle, lineWidth) {
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i][0], points[i][1]);
        }
        ctx.closePath();
        if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
        if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth || 1; ctx.stroke(); }
    }

    const ties = [
        { top: [[186, 306], [326, 306], [332, 314], [180, 314]], front: [[180, 314], [332, 314], [332, 320], [180, 320]], strokeWidth: 1.5 },
        { top: [[164, 338], [348, 338], [356, 348], [156, 348]], front: [[156, 348], [356, 348], [356, 356], [156, 356]], strokeWidth: 1.8 },
        { top: [[136, 378], [376, 378], [388, 392], [124, 392]], front: [[124, 392], [388, 392], [388, 402], [124, 402]], strokeWidth: 2.2 },
        { top: [[98, 428], [414, 428], [430, 446], [82, 446]], front: [[82, 446], [430, 446], [430, 460], [82, 460]], strokeWidth: 2.6 }
    ];

    ties.forEach(tie => {
        const topGrad = ctx.createLinearGradient(0, tie.top[0][1], 0, tie.top[2][1]);
        topGrad.addColorStop(0, '#3a558a');
        topGrad.addColorStop(1, '#2c426f');
        drawPoly(tie.top, topGrad, 'rgba(0, 229, 255, 0.45)', tie.strokeWidth);

        const frontGrad = ctx.createLinearGradient(0, tie.front[0][1], 0, tie.front[2][1]);
        frontGrad.addColorStop(0, '#1e2e4e');
        frontGrad.addColorStop(1, '#141f36');
        drawPoly(tie.front, frontGrad, null);
    });

    const railGrad = ctx.createLinearGradient(0, 290, 0, 465);
    railGrad.addColorStop(0, '#00e5ff');
    railGrad.addColorStop(1, '#0077ff');

    drawPoly([[194, 290], [206, 290], [120, 465], [102, 465]], railGrad, null);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(194, 290); ctx.lineTo(102, 465); ctx.stroke();

    drawPoly([[306, 290], [318, 290], [410, 465], [392, 465]], railGrad, null);
    ctx.beginPath(); ctx.moveTo(318, 290); ctx.lineTo(410, 465); ctx.stroke();

    ctx.fillStyle = '#132247'; ctx.strokeStyle = '#00d2ff'; ctx.lineWidth = 12; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(165, 110); ctx.bezierCurveTo(165, 65, 200, 50, 256, 50);
    ctx.bezierCurveTo(312, 50, 347, 65, 347, 110); ctx.lineTo(360, 250);
    ctx.bezierCurveTo(360, 278, 335, 292, 256, 292); ctx.bezierCurveTo(177, 292, 152, 278, 152, 250);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#080e1d'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(188, 115); ctx.bezierCurveTo(188, 95, 210, 82, 256, 82);
    ctx.bezierCurveTo(302, 82, 324, 95, 324, 115); ctx.lineTo(332, 172); ctx.lineTo(180, 172);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#00d2ff';
    ctx.beginPath(); ctx.arc(202, 242, 14, 0, Math.PI * 2); ctx.arc(310, 242, 14, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#10b981'; ctx.fillRect(230, 233, 52, 18);

    ctx.fillStyle = '#080e1d'; ctx.strokeStyle = '#00d2ff'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(365, 365, 76, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = 'rgba(0, 210, 255, 0.08)';
    ctx.beginPath(); ctx.arc(365, 365, 66, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(365, 315); ctx.lineTo(365, 365); ctx.lineTo(408, 365); ctx.stroke();

    ctx.fillStyle = '#00d2ff';
    ctx.beginPath(); ctx.arc(365, 365, 6.5, 0, Math.PI * 2); ctx.fill();

    const iconUrl = canvas.toDataURL('image/png');
    document.getElementById('dynamic-touch-icon').href = iconUrl;
    document.getElementById('dynamic-favicon').href = iconUrl;
})();

window.shifts = JSON.parse(localStorage.getItem('railway_shifts') || '[]');
let currentView = sessionStorage.getItem('railway_active_view') || 'clock';
let isSelectionMode = false;
let isSortingMode = false;
let isMultiPanelMode = false; 
let selectedShiftIds = new Set();
let draggedElement = null;
let activeMonthKey = ''; 

const bottomNav = document.getElementById('bottomNav');
const navIndicator = document.getElementById('navIndicator');
let isNavDragging = false;
let navTouchActive = false; 
let navStartX = 0;
let navStartY = 0;
let navCurrentOffsetPercent = 0;
let navHasMoved = false;

if (bottomNav) {
    bottomNav.addEventListener('touchstart', (e) => {
        const wrap = document.getElementById('toolsDrawerWrap');
        if (wrap && wrap.classList.contains('open')) {
            window.toggleToolsDrawer(false);
            navTouchActive = false;
            navHasMoved = true;
            isNavDragging = false;
            return;
        }

        navTouchActive = true;
        navHasMoved = false;
        navStartX = e.touches[0].clientX;
        navStartY = e.touches[0].clientY;
        
        const target = e.target;
        const isValidTouchStart = target.closest('.nav-indicator') || target.closest('.nav-tab');
        
        if (isValidTouchStart && bottomNav.contains(target)) {
            isNavDragging = true;
            navIndicator.style.transition = 'none';
            navCurrentOffsetPercent = (currentView === 'history') ? 100 : 0;
        } else {
            isNavDragging = false;
        }
    }, { passive: true });

    bottomNav.addEventListener('touchmove', (e) => {
        if (!navTouchActive) return;
        const deltaX = e.touches[0].clientX - navStartX;
        const deltaY = e.touches[0].clientY - navStartY;
        
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            navHasMoved = true;
        }

        if (!isNavDragging) return;
        if (e.cancelable) e.preventDefault();
        
        const navRect = bottomNav.getBoundingClientRect();
        const movePercent = (-deltaX / (navRect.width / 2)) * 100;
        
        let newOffset = navCurrentOffsetPercent + movePercent;
        newOffset = Math.max(0, Math.min(100, newOffset));
        
        navIndicator.style.transform = 'translateX(-' + newOffset + '%)';
    }, { passive: false });

    bottomNav.addEventListener('touchend', (e) => {
        if (!navTouchActive) return;
        navTouchActive = false;
        
        if (!navHasMoved) {
            isNavDragging = false;
            return; 
        }

        if (isNavDragging) {
            isNavDragging = false;
            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - navStartX;
            const navRect = bottomNav.getBoundingClientRect();
            const movePercent = (-deltaX / (navRect.width / 2)) * 100;
            let finalOffset = navCurrentOffsetPercent + movePercent;

            if (finalOffset > 55) {
                window.navigateTo('history', false); 
            } else {
                window.navigateTo('clock', false); 
            }
        }
    });

    bottomNav.addEventListener('touchcancel', () => {
        navTouchActive = false;
        isNavDragging = false;
        updateIndicatorPosition(true);
    });
}

window.handleNavClick = function(target) {
    const wrap = document.getElementById('toolsDrawerWrap');
    if (wrap && wrap.classList.contains('open')) {
        window.toggleToolsDrawer(false);
        return;
    }
    if (navHasMoved) return; 
    window.navigateTo(target);
};

function updateIndicatorPosition(animate = true) {
    if (!navIndicator) return;
    navIndicator.style.transition = animate ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
    
    if (currentView === 'history') {
        navIndicator.style.transform = 'translateX(-100%)'; 
    } else {
        navIndicator.style.transform = 'translateX(0%)'; 
    }
}

window.addEventListener('resize', () => updateIndicatorPosition(false));

window.navigateTo = function(viewName, closeMenu = true) {
    // בדיקת הרשאה: רק ה-Owner רשאי לגשת לדף הניהול ולמדריך פקודות Git
    if (viewName === 'admin' || viewName === 'gitCommands') {
        if (!window.currentUser || window.currentUser.uid !== OWNER_UID) {
            console.warn('גישה נדחתה.');
            viewName = 'clock';
        }
    }

    currentView = viewName;
    sessionStorage.setItem('railway_active_view', viewName);

    window.closeUserMenu();
    const toolsWrap = document.getElementById('toolsDrawerWrap');
    if (toolsWrap) toolsWrap.classList.remove('open');

    const authContainer = document.getElementById('headerAuthContainer');
    if (authContainer) {
        if (viewName === 'profile' || viewName === 'admin' || viewName === 'gitCommands') {
            authContainer.classList.add('disabled-profile');
        } else {
            authContainer.classList.remove('disabled-profile');
        }
    }

    document.getElementById('viewClock').style.display = (viewName === 'clock') ? 'flex' : 'none';
    document.getElementById('viewHistory').style.display = (viewName === 'history') ? 'flex' : 'none';
    document.getElementById('viewProfile').style.display = (viewName === 'profile') ? 'flex' : 'none';
    document.getElementById('viewAdmin').style.display = (viewName === 'admin') ? 'flex' : 'none';
    const viewGitCmds = document.getElementById('viewGitCommands');
    if (viewGitCmds) viewGitCmds.style.display = (viewName === 'gitCommands') ? 'flex' : 'none';

    const bottomNavEl = document.getElementById('bottomNav').closest('.bottom-nav-wrapper');
    if (viewName === 'profile' || viewName === 'admin' || viewName === 'gitCommands') {
        bottomNavEl.style.display = 'none'; 
    } else {
        bottomNavEl.style.display = 'flex';
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        const targetTab = document.querySelector('.nav-tab[data-target="' + viewName + '"]');
        if (targetTab) targetTab.classList.add('active');
    }

    const toolsWrapEl = document.getElementById('toolsDrawerWrap');
    if (viewName === 'history') {
        if (toolsWrapEl) toolsWrapEl.style.display = 'block';
    } else {
        if (toolsWrapEl) toolsWrapEl.style.display = 'none';
    }

    requestAnimationFrame(() => updateIndicatorPosition(true));
    updateActiveShiftUI(); 

    if (viewName === 'history') {
        renderShifts();
    }

    if (viewName === 'admin') {
        loadAdminUsersList();
    }
};

window.copyInAppCmd = function(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'הועתק! ✓';
        btn.style.background = '#1f6feb';
        setTimeout(() => {
            btn.textContent = orig;
            btn.style.background = '#2ea043';
        }, 1400);
    }).catch(err => {
        alert('העתקה נכשלה: ' + err);
    });
};

window.filterInAppGitCommands = function() {
    const q = (document.getElementById('gitCmdSearch').value || '').trim().toLowerCase();
    const rows = document.querySelectorAll('.git-row-item');
    const hdrs = document.querySelectorAll('.git-cat-hdr');
    let count = 0;

    rows.forEach(r => {
        const text = (r.getAttribute('data-search') + ' ' + r.innerText).toLowerCase();
        if (!q || text.includes(q)) {
            r.style.display = 'flex';
            count++;
        } else {
            r.style.display = 'none';
        }
    });

    hdrs.forEach(h => {
        let next = h.nextElementSibling;
        let has = false;
        while (next && next.classList.contains('git-row-item')) {
            if (next.style.display !== 'none') {
                has = true;
                break;
            }
            next = next.nextElementSibling;
        }
        h.style.display = (has || !q) ? 'block' : 'none';
    });

    const noRes = document.getElementById('inAppGitNoResults');
    if (noRes) noRes.style.display = count === 0 ? 'block' : 'none';
};

window.updateBodyScrollLock = function() {
    const hasOpenModal = document.querySelector(
        '.modal-overlay.open, .error-dialog-overlay.open, .perm-modal-overlay.open, .menu-backdrop.open, .tools-drawer-backdrop.open'
    );
    if (hasOpenModal) {
        document.body.classList.add('modal-open');
    } else {
        document.body.classList.remove('modal-open');
    }
};

window.toggleToolsDrawer = function(forceState) {
    const wrap = document.getElementById('toolsDrawerWrap');
    const backdrop = document.getElementById('toolsDrawerBackdrop');
    const navWrapper = document.querySelector('.bottom-nav-wrapper');
    if (!wrap) return;

    const isOpen = typeof forceState === 'boolean' ? forceState : !wrap.classList.contains('open');
    if (isOpen) {
        wrap.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
        if (navWrapper) navWrapper.classList.add('tools-open');
    } else {
        wrap.classList.remove('open');
        if (backdrop) backdrop.classList.remove('open');
        if (navWrapper) navWrapper.classList.remove('tools-open');
    }
    window.updateBodyScrollLock();
};

window.closeToolsDrawer = function(e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    window.toggleToolsDrawer(false);
};

let statusBubbleTimer = null;

function showStatusBubbleToast(msg) {
    const toast = document.getElementById('statusBubbleToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    if (statusBubbleTimer) {
        clearTimeout(statusBubbleTimer);
    }
    statusBubbleTimer = setTimeout(() => {
        toast.classList.remove('show');
        statusBubbleTimer = null;
    }, 2200);
}

// ---------------------------------------------------------
// פונקציות גלובליות נדרשות
// ---------------------------------------------------------
window.closeUserMenu = function(e) {
    if(e) {
        e.stopPropagation();
        e.preventDefault();
    }
    const dropdown = document.getElementById('userDropdownMenu');
    const backdrop = document.getElementById('menuBackdrop');
    const authContainer = document.getElementById('headerAuthContainer');
    if (dropdown) dropdown.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (authContainer) authContainer.classList.remove('menu-open');
    window.updateBodyScrollLock();
};

window.handleAuthClick = async function(event) {
    event.stopPropagation();
    if (currentView === 'profile' || currentView === 'admin') return;

    const dropdown = document.getElementById('userDropdownMenu');
    const backdrop = document.getElementById('menuBackdrop');
    const authContainer = document.getElementById('headerAuthContainer');
    if (!dropdown) return;

    const isOpen = dropdown.classList.contains('open');
    if (isOpen) {
        window.closeUserMenu();
        return;
    }

    if (window.currentUser) {
        dropdown.innerHTML = `
            <button class="dropdown-item" onclick="goToProfileView()">
                <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                <span>פרופיל אישי</span>
            </button>
            <button class="dropdown-item" onclick="openSettingsModal()">
                <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                <span>הגדרות</span>
            </button>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item danger-item" onclick="confirmSignOut()">
                <svg viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
                <span>התנתקות</span>
            </button>
        `;
    } else {
        dropdown.innerHTML = `
            <button class="dropdown-item" onclick="window.closeUserMenu(); if(window.triggerGoogleSignIn) window.triggerGoogleSignIn();">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
                <span>התחברות</span>
            </button>
            <button class="dropdown-item" onclick="openSettingsModal()">
                <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                <span>הגדרות</span>
            </button>
        `;
    }

    if (authContainer) {
        const rect = authContainer.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 8) + 'px';
        dropdown.style.left = rect.left + 'px';
        authContainer.classList.add('menu-open');
    }
    dropdown.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    window.updateBodyScrollLock();
};

window.openMonthlySummaryModal = function(mk) {
    const mShifts = window.shifts.filter(s => s.date && s.date.startsWith(mk));
    let totWorkMins = 0;
    let totPremMins = 0;
    let totNaltMins = 0;

    mShifts.forEach(s => {
         if(s.startTime && s.endTime) {
             totWorkMins += window.calculateDurationMinutes(s.startTime, s.endTime);
         }
         if(s.premStartTime && s.premEndTime) {
             totPremMins += window.calculateDurationMinutes(s.premStartTime, s.premEndTime);
         }
         totNaltMins += (Number(s.naltStartMinutes)||0) + (Number(s.naltEndMinutes)||0);
    });

    document.getElementById('summaryModalTitle').textContent = 'סיכום חודשי - ' + formatMonthName(mk);
    document.getElementById('modalWorkVal').textContent = window.formatMinutesToHM(totWorkMins);
    document.getElementById('modalPremVal').textContent = window.formatMinutesToHM(totPremMins);
    const exportBtn = document.getElementById('modalExportBtn');
    if (exportBtn) {
        exportBtn.setAttribute('data-month', mk);
        exportBtn.onclick = function() {
            printMonthReport(mk);
        };
    }

    document.getElementById('monthlySummaryModal').classList.add('open');
};

window.closeMonthlySummaryModal = function() {
    document.getElementById('monthlySummaryModal').classList.remove('open');
};

window.validateModalRealtime = function(isSubmit = false) {
    const startInput = document.getElementById('fieldStartTime');
    const endInput = document.getElementById('fieldEndTime');
    const premStartInput = document.getElementById('fieldPremStart');
    const premEndInput = document.getElementById('fieldPremEnd');
    
    const shiftErr = document.getElementById('shiftTimeError');
    const premErr = document.getElementById('premTimeError');

    const state = getValidationState();

    if (state.bothEmptyInvalid && !isSubmit) {
        startInput.classList.remove('input-error');
        endInput.classList.remove('input-error');
        shiftErr.classList.remove('visible');
    } else {
        if (state.startInvalid) startInput.classList.add('input-error');
        else startInput.classList.remove('input-error');

        if (state.endInvalid) endInput.classList.add('input-error');
        else endInput.classList.remove('input-error');

        if (state.startInvalid || state.endInvalid) {
            shiftErr.textContent = state.shiftError;
            shiftErr.classList.add('visible');
        } else {
            shiftErr.classList.remove('visible');
        }
    }

    if (state.premStartInvalid) premStartInput.classList.add('input-error');
    else premStartInput.classList.remove('input-error');

    if (state.premEndInvalid) premEndInput.classList.add('input-error');
    else premEndInput.classList.remove('input-error');

    if (state.premStartInvalid || state.premEndInvalid) {
        premErr.textContent = state.premError || 'הפרמיה מחוץ לזמני המשמרת';
        premErr.classList.add('visible');
    } else {
        premErr.classList.remove('visible');
    }
};

window.onFullPremCheckboxChange = function(isChecked) {
    const startInput = document.getElementById('fieldStartTime').value;
    const endInput = document.getElementById('fieldEndTime').value;
    if (isChecked && startInput && (!endInput || startInput !== endInput)) {
        const times = calculateFullPremTimes(startInput, endInput);
        document.getElementById('fieldPremStart').value = times.start;
        document.getElementById('fieldPremEnd').value = times.end;
    } else if (!isChecked || (startInput && endInput && startInput === endInput)) {
        document.getElementById('fieldPremStart').value = '';
        document.getElementById('fieldPremEnd').value = '';
    }
    window.validateModalRealtime(true);
};

window.handleModalTimeChangeForFullPrem = function() {
    const isChecked = document.getElementById('fieldFullPremModal').checked;
    if (isChecked) {
        const startInput = document.getElementById('fieldStartTime').value;
        const endInput = document.getElementById('fieldEndTime').value;
        if (startInput && endInput && startInput !== endInput) {
            const times = calculateFullPremTimes(startInput, endInput);
            document.getElementById('fieldPremStart').value = times.start;
            document.getElementById('fieldPremEnd').value = times.end;
        } else {
            document.getElementById('fieldPremStart').value = startInput || '';
            document.getElementById('fieldPremEnd').value = '';
        }
    }
};

window.handleManualPremChange = function() {
    const checkbox = document.getElementById('fieldFullPremModal');
    if (checkbox && checkbox.checked) {
        checkbox.checked = false;
    }
};

window.handleNaltSelectChange = function(type) {
    const select = document.getElementById('selectNalt' + type);
    const customInput = document.getElementById('customNalt' + type);
    if (select.value === 'custom') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
};

function setupGlobalInteractions() {
    const drawerItems = document.querySelectorAll('.tools-popup-drawer .btn-drawer-item, .month-accordion-header .btn-summary-modal');
    
    drawerItems.forEach(btn => {
        const freshBtn = btn.cloneNode(true);
        btn.replaceWith(freshBtn);
    });

    document.querySelectorAll('.tools-popup-drawer .btn-drawer-item, .month-accordion-header .btn-summary-modal').forEach(btn => {
        let pressTimer = null;
        let longPressed = false;
        let isTouchInteraction = false;
        const tooltip = btn.querySelector('.drawer-tooltip');
        const actionType = btn.getAttribute('data-action');

        const startPress = (e) => {
            if (e.type === 'touchstart') {
                isTouchInteraction = true;
            } else if (e.type === 'mousedown') {
                if (isTouchInteraction) return;
            }
            longPressed = false;
            if (pressTimer) clearTimeout(pressTimer);
            pressTimer = setTimeout(() => {
                longPressed = true;
                if (tooltip) tooltip.classList.add('show');
            }, 500);
        };

        const endPress = (e) => {
            if (e.type === 'mouseup' && isTouchInteraction) {
                setTimeout(() => { isTouchInteraction = false; }, 300);
                return;
            }

            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }

            if (tooltip && tooltip.classList.contains('show')) {
                setTimeout(() => tooltip.classList.remove('show'), 1500);
            }

            if (!longPressed) {
                if (actionType === 'summary') {
                    const mk = btn.getAttribute('data-month');
                    if (mk) window.openMonthlySummaryModal(mk);
                } else if (actionType) {
                    window.handleToolAction(actionType);
                }
            } else {
                if (e.cancelable) {
                    e.preventDefault();
                }
            }
            longPressed = false;

            if (e.type === 'touchend' || e.type === 'touchcancel') {
                setTimeout(() => { isTouchInteraction = false; }, 400);
            }
        };

        btn.addEventListener('touchstart', startPress, {passive: true});
        btn.addEventListener('touchend', endPress);
        btn.addEventListener('touchcancel', (e) => {
            if (pressTimer) clearTimeout(pressTimer);
            if (tooltip) tooltip.classList.remove('show');
            setTimeout(() => { isTouchInteraction = false; }, 400);
        });
        btn.addEventListener('mousedown', startPress);
        btn.addEventListener('mouseup', endPress);
        btn.addEventListener('mouseleave', () => {
            if (pressTimer) clearTimeout(pressTimer);
            if (tooltip) tooltip.classList.remove('show');
        });
    });

    const exportBtn = document.getElementById('modalExportBtn');
    if (exportBtn && !exportBtn.dataset.touchInit) {
        exportBtn.dataset.touchInit = 'true';
        exportBtn.addEventListener('touchstart', () => exportBtn.classList.add('active-touch'), {passive: true});
        exportBtn.addEventListener('touchend', () => exportBtn.classList.remove('active-touch'));
        exportBtn.addEventListener('touchcancel', () => exportBtn.classList.remove('active-touch'));
    }
}

window.handleToolAction = function(type) {
    if (type === 'multipanel') toggleMultiPanelMode();
    else if (type === 'sorting') toggleSortingMode();
    else if (type === 'selection') toggleSelectionMode();
    
    window.toggleToolsDrawer(false);
};

function populateProfileMonthSelector() {
    const select = document.getElementById('profileMonthSelect');
    if (!select) return;

    let monthsSet = new Set();
    window.shifts.forEach(s => {
        if (s.date) monthsSet.add(s.date.substring(0, 7));
    });

    let sortedMonths = Array.from(monthsSet).sort((a,b) => b.localeCompare(a));
    
    let optionsHTML = '<option value="annual">סיכום שנתי</option>';
    sortedMonths.forEach(mk => {
        optionsHTML += '<option value="' + mk + '">' + formatMonthName(mk) + '</option>';
    });
    select.innerHTML = optionsHTML;
}

window.updateProfileSummaryData = function() {
    const select = document.getElementById('profileMonthSelect');
    const val = select ? select.value : 'annual';

    let targetShifts = window.shifts;
    if (val !== 'annual') {
        targetShifts = window.shifts.filter(s => s.date && s.date.startsWith(val));
    }

    let totWorkMins = 0;
    let totPremMins = 0;
    let totNaltMins = 0;

    targetShifts.forEach(s => {
        if (s.startTime && s.endTime) {
            totWorkMins += window.calculateDurationMinutes(s.startTime, s.endTime);
        }
        if (s.premStartTime && s.premEndTime) {
            totPremMins += window.calculateDurationMinutes(s.premStartTime, s.premEndTime);
        }
        totNaltMins += (Number(s.naltStartMinutes)||0) + (Number(s.naltEndMinutes)||0);
    });

    document.getElementById('profWorkVal').textContent = window.formatMinutesToHM(totWorkMins) || '0 שעות';
    document.getElementById('profPremVal').textContent = window.formatMinutesToHM(totPremMins) || '0 שעות';
    document.getElementById('profNaltVal').textContent = window.formatMinutesToHM(totNaltMins) || '0 שעות';
};

function updateLiveClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');

    document.getElementById('clockMain').textContent = hh + ':' + mm;

    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const dStr = 'יום ' + days[now.getDay()] + ', ' + now.getDate() + '.' + (now.getMonth() + 1) + '.' + now.getFullYear();
    document.getElementById('currentDate').textContent = dStr;

    updateActiveShiftUI();
}

setInterval(updateLiveClock, 1000);
updateLiveClock();

function getActiveShift() {
    if (!window.shifts || window.shifts.length === 0) return null;
    const MAX_SHIFT_MS = 12.5 * 60 * 60 * 1000;
    const now = Date.now();

    return window.shifts.find(s => {
        if (!s.startTime || s.endTime) return false;
        if (!s.date) return false;
        const [y, m, d] = s.date.split('-').map(Number);
        const [sh, sm] = s.startTime.split(':').map(Number);
        const startEpoch = new Date(y, m - 1, d, sh, sm, 0).getTime();
        const elapsed = now - startEpoch;
        return elapsed >= -60000 && elapsed <= MAX_SHIFT_MS;
    }) || null;
}

function updateActiveShiftUI() {
    const active = getActiveShift();
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const headerTimer = document.getElementById('headerShiftDuration');
    const floatingBar = document.getElementById('activeShiftFloatingBar');
    
    const headerPWrap = document.getElementById('headerProgressWrap');
    const headerPFill = document.getElementById('headerProgressFill');

    const btnMainAction = document.getElementById('btnMainAction');
    const mainActionLine1 = document.getElementById('mainActionTextLine1');
    const mainActionLine2 = document.getElementById('mainActionTextLine2');

    if (active) {
        if (floatingBar) floatingBar.classList.add('visible');
        if (statusIndicator) statusIndicator.className = 'status-badge active';
        if (statusText) statusText.textContent = 'במשמרת';

        const [year, month, day] = (active.date || '').split('-').map(Number);
        const [sh, sm] = active.startTime.split(':').map(Number);
        let totalSec = 0;
        if (year && month && day) {
            const startEpoch = new Date(year, month - 1, day, sh, sm, 0).getTime();
            totalSec = Math.max(0, Math.floor((Date.now() - startEpoch) / 1000));
        } else {
            const now = new Date();
            totalSec = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) - (sh * 3600 + sm * 60);
            if (totalSec < 0) totalSec += 86400;
        }

        const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
        const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
        const s = String(totalSec % 60).padStart(2, '0');

        if (headerTimer) headerTimer.textContent = h + ':' + m + ':' + s;
        
        let durMins = Math.floor(totalSec / 60);
        let pct = Math.min((durMins / 720), 1); 

        if (headerPWrap) headerPWrap.style.display = 'block';
        if (headerPFill) {
            headerPFill.style.width = (pct * 100) + '%';
            headerPFill.className = 'header-progress-fill fill-green';
        }

        if (btnMainAction) btnMainAction.className = 'btn-main-circle state-active';
        if (mainActionLine1) mainActionLine1.textContent = 'יציאה';
        if (mainActionLine2) mainActionLine2.textContent = 'ממשמרת';

    } else {
        if (floatingBar) floatingBar.classList.remove('visible');
        if (statusIndicator) statusIndicator.className = 'status-badge idle';
        if (statusText) statusText.textContent = '';
        if (headerTimer) headerTimer.textContent = '00:00:00';
        if (headerPWrap) headerPWrap.style.display = 'none';

        if (btnMainAction) btnMainAction.className = 'btn-main-circle state-idle';
        if (mainActionLine1) mainActionLine1.textContent = 'כניסה';
        if (mainActionLine2) mainActionLine2.textContent = 'למשמרת';
    }
}

window.handleMainAction = function() {
    const active = getActiveShift();
    if (active) {
        handleLiveEnd();
    } else {
        handleLiveStart();
    }
};

function autoSortShiftsArray(arr) {
    arr.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) {
            return dateB.localeCompare(dateA);
        }
        const timeA = a.startTime || '00:00';
        const timeB = b.startTime || '00:00';
        return timeB.localeCompare(timeA);
    });
}

function calculateOverlaps() {
    const overlappingIds = new Set();
    const intervals = [];

    window.shifts.forEach(shift => {
        if (!shift.date || !shift.startTime) return;
        const [y, m, d] = shift.date.split('-').map(Number);
        const [sh, sm] = shift.startTime.split(':').map(Number);
        
        const startEpoch = new Date(y, m - 1, d, sh, sm, 0).getTime();
        let endEpoch;

        if (shift.endTime) {
            const [eh, em] = shift.endTime.split(':').map(Number);
            let endDate = new Date(y, m - 1, d, eh, em, 0);
            if (endDate.getTime() <= startEpoch) {
                endDate.setDate(endDate.getDate() + 1);
            }
            endEpoch = endDate.getTime();
        } else {
            endEpoch = startEpoch + (12.5 * 60 * 60 * 1000);
        }

        intervals.push({ id: String(shift.id), start: startEpoch, end: endEpoch });
    });

    for (let i = 0; i < intervals.length; i++) {
        for (let j = i + 1; j < intervals.length; j++) {
            const a = intervals[i];
            const b = intervals[j];
            if (Math.max(a.start, b.start) < Math.min(a.end, b.end)) {
                overlappingIds.add(String(a.id));
                overlappingIds.add(String(b.id));
            }
        }
    }

    return overlappingIds;
}

function showSmartAlertDialog(title, message, confirmText, cancelText, onConfirm, onCancel) {
    document.getElementById('smartAlertTitle').textContent = title;
    document.getElementById('smartAlertMessage').textContent = message;
    
    const actionsContainer = document.getElementById('smartAlertActions');
    actionsContainer.innerHTML = '';

    const btnConfirm = document.createElement('button');
    btnConfirm.className = 'btn-dialog-action btn-dialog-confirm';
    btnConfirm.textContent = confirmText;
    btnConfirm.onclick = () => {
        closeSmartAlert();
        if (onConfirm) onConfirm();
    };

    if (cancelText) {
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn-dialog-action btn-dialog-cancel';
        btnCancel.textContent = cancelText;
        btnCancel.onclick = () => {
            closeSmartAlert();
            if (onCancel) onCancel();
        };
        actionsContainer.appendChild(btnCancel);
    }
    actionsContainer.appendChild(btnConfirm);

    document.getElementById('smartAlertDialog').classList.add('open');
}

window.closeSmartAlert = function() {
    document.getElementById('smartAlertDialog').classList.remove('open');
};

function handleLiveStart() {
    const unclosedPriorShift = (window.shifts || []).find(s => s.startTime && !s.endTime);

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const dateStr = y + '-' + m + '-' + d;
    const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    const newShift = {
        id: 'shift_' + Date.now(),
        siddur: '',
        date: dateStr,
        startTime: timeStr,
        endTime: null,
        naltStartMinutes: 0,
        naltEndMinutes: 0,
        premStartTime: '',
        premEndTime: '',
        instructorStartTime: '',
        instructorEndTime: '',
        fullPrem: false,
        notes: ''
    };

    window.shifts.unshift(newShift);
    activeMonthKey = dateStr.substring(0, 7); 
    autoSortShiftsArray(window.shifts);
    saveShifts(newShift);

    if (unclosedPriorShift) {
        let dateFormatted = '';
        if (unclosedPriorShift.date) {
            const parts = unclosedPriorShift.date.split('-');
            if (parts.length === 3) {
                dateFormatted = `${parts[2]}/${parts[1]}`;
            }
        }
        const msg = dateFormatted
            ? `המשמרת הקודמת (מתאריך ${dateFormatted}) נותרה ללא שעת סיום – תוכל להשלים אותה ידנית ביומן המשמרות.`
            : `המשמרת הקודמת נותרה ללא שעת סיום – תוכל להשלים אותה ידנית ביומן המשמרות.`;
        showSmartAlertDialog('שים לב', msg, 'הבנתי', '', () => {}, () => {});
    }
}

function handleLiveEnd() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const currentDateStr = y + '-' + m + '-' + d;
    const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    
    const active = getActiveShift();

    if (!active) {
        showSmartAlertDialog('אין משמרת פעילה', 'לא נמצאה משמרת פעילה לסיום.', 'הבנתי', '', () => {}, () => {});
        return;
    }

    const shiftDateStr = active.date || currentDateStr;
    const isSameDay = (shiftDateStr === currentDateStr);

    const [sh, sm] = active.startTime.split(':').map(Number);
    const [eh, em] = timeStr.split(':').map(Number);
    let startMins = sh * 60 + sm;
    let endMins = eh * 60 + em;

    if (isSameDay) {
        if (endMins <= startMins) endMins += 1440;
    } else {
        const shiftDateObj = new Date(shiftDateStr);
        const currDateObj = new Date(currentDateStr);
        const dayDiff = Math.round((currDateObj - shiftDateObj) / (1000 * 60 * 60 * 24));
        if (dayDiff > 0) {
            endMins += (dayDiff * 1440);
        }
    }

    const durationMins = endMins - startMins;

    if (isSameDay && (durationMins === 0 || active.startTime === timeStr)) {
        showSmartAlertDialog('זמנים זהים זוהו', 'שעת הכניסה ושעת היציאה זהות (משמרת באורך 0 זמן). האם ברצונך לבטל ולמחוק משמרת זו?', 'אישור (מחיקה)', 'ביטול', () => {
            const targetId = active.id;
            window.shifts = window.shifts.filter(s => String(s.id) !== String(targetId));
            autoSortShiftsArray(window.shifts);
            deleteShiftFromCloudAndLocal(targetId);
            if (currentView === 'history') renderShifts();
        }, () => {});
        return;
    }

    if (!isSameDay && durationMins > 780) {
        showSmartAlertDialog('משמרת חורגת משכחה', 'עברו למעלה מ-13 שעות מתחילת המשמרת. יש להתאים את שעת הסיום הרלוונטית באופן ידני.', 'הבנתי', '', () => {}, () => {});
        return;
    }

    if (isSameDay && durationMins > 0 && durationMins < 180) {
        const hoursFormatted = Math.floor(durationMins / 60);
        const minsFormatted = durationMins % 60;
        const durStr = hoursFormatted > 0 ? hoursFormatted + ' שעות ו-' + minsFormatted + ' דק׳' : minsFormatted + ' דק׳';

        showSmartAlertDialog('משמרת קצרה מהרגיל', 'משמרת זו קצרה מהרגיל ותימשך כ-' + durStr + '. האם אתה בטוח שברצונך לסיים ולשמור אותה?', 'אישור (שמירה)', 'ביטול', () => {
            active.endTime = timeStr;
            if (active.fullPrem && active.startTime !== timeStr) {
                applyFullPremToShift(active);
            }
            autoSortShiftsArray(window.shifts);
            saveShifts(active);
            if (currentView === 'history') renderShifts();
        }, () => {});
        return;
    }

    active.endTime = timeStr;
    if (active.fullPrem && active.startTime !== timeStr) {
        applyFullPremToShift(active);
    }
    autoSortShiftsArray(window.shifts);
    saveShifts(active);
    if (currentView === 'history') renderShifts();
}

function saveShifts(targetShift = null) {
    if (targetShift) {
        saveShiftToCloudAndLocal(targetShift);
    } else {
        localStorage.setItem('railway_shifts', JSON.stringify(window.shifts));
    }
    updateActiveShiftUI();
}

function parseInputToMinutes(val) {
    if (!val) return 0;
    const str = String(val).trim();
    if (str.includes(':')) {
        const [h, m] = str.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }
    if (str.includes('.') || str.includes(',')) {
        const cleaned = str.replace(',', '.');
        return Math.round(parseFloat(cleaned) * 60) || 0;
    }
    const num = parseFloat(str);
    if (isNaN(num)) return 0;
    return num <= 12 ? Math.round(num * 60) : Math.round(num);
}

window.formatMinutesToHM = function(mins) {
    if (!mins || mins <= 0) return '0 שעות';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return m + ' דק׳';
    if (m === 0) return h + ' שעות';
    return h + ':' + String(m).padStart(2, '0');
};

function formatMinutesToDisplay(mins) {
    if (!mins || mins <= 0) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function addMinutesToTime(timeStr, minsToAdd) {
    if (!timeStr) return '--:--';
    const [h, m] = timeStr.split(':').map(Number);
    let total = h * 60 + m + minsToAdd;
    total = (total + 1440) % 1440;
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

function subtractMinutesFromTime(timeStr, minsToSub) {
    if (!timeStr) return '--:--';
    const [h, m] = timeStr.split(':').map(Number);
    let total = h * 60 + m - minsToSub;
    total = (total + 1440) % 1440;
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

function calculateDuration(start, end) {
    if (!start || !end) return '--';
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 1440;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    if (hours === 0 && mins === 0) return '0 דק׳';
    if (mins === 0) return hours + ' שעות';
    if (hours === 0) return mins + ' דק׳';
    return hours + ' שעות ו-' + mins + ' דק׳';
}

window.calculateDurationMinutes = function(start, end) {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 1440;
    return diff;
};

window.parseSiddurDisplay = function(siddur) {
    if (!siddur || !siddur.trim()) return { primary: '', secondary: '' };
    const text = siddur.trim();
    const numPattern = /(\d+(?:[-/]\d+)*)/;
    const match = text.match(numPattern);

    if (match) {
        const primary = match[1];
        const secondary = text.replace(match[1], '').replace(/\s+/g, ' ').trim();
        return { primary, secondary };
    } else {
        return { primary: text, secondary: '' };
    }
};

function formatMonthName(mk) {
    const [y, m] = mk.split('-');
    const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    return months[parseInt(m, 10) - 1] + ' ' + y;
}

window.showErrorDialog = function(msg, title = 'שגיאה בנתוני המשמרת') {
    document.getElementById('errorDialogTitle').textContent = title;
    document.getElementById('errorDialogMessage').textContent = msg;
    document.getElementById('errorDialog').classList.add('open');
};

window.closeErrorDialog = function() {
    document.getElementById('errorDialog').classList.remove('open');
};

window.toggleSelectionMode = function() {
    if (isSortingMode) toggleSortingMode();

    isSelectionMode = !isSelectionMode;
    selectedShiftIds.clear();
    
    const btn = document.getElementById('btnToggleSelection');
    const toolbar = document.getElementById('selectionToolbar');
    const container = document.getElementById('shiftsContainer');

    if (isSelectionMode) {
        btn.classList.add('active-mode');
        toolbar.classList.add('active');
        container.classList.add('mode-selection');
        showStatusBubbleToast("מצב בחירה פעיל");
    } else {
        btn.classList.remove('active-mode');
        toolbar.classList.remove('active');
        container.classList.remove('mode-selection');
        showStatusBubbleToast("מצב בחירה כבוי");
    }
    
    updateSelectionUI();
    renderShifts();
};

window.toggleSortingMode = function() {
    if (isSelectionMode) toggleSelectionMode();

    isSortingMode = !isSortingMode;
    const btn = document.getElementById('btnToggleSorting');
    const toolbar = document.getElementById('sortingToolbar');
    const container = document.getElementById('shiftsContainer');

    if (isSortingMode) {
        btn.classList.add('active-mode');
        toolbar.classList.add('active');
        container.classList.add('mode-sorting');
        showStatusBubbleToast("מיון משמרות פעיל");
    } else {
        btn.classList.remove('active-mode');
        toolbar.classList.remove('active');
        container.classList.remove('mode-sorting');
        showStatusBubbleToast("מיון משמרות כבוי");
    }

    renderShifts();
};

window.toggleMultiPanelMode = function() {
    isMultiPanelMode = !isMultiPanelMode;
    const btn = document.getElementById('btnToggleMultiPanel');
    if (btn) {
        btn.classList.toggle('active-mode', isMultiPanelMode);
    }

    if (isMultiPanelMode) {
        showStatusBubbleToast("ריבוי פאנלים פעיל");
    } else {
        showStatusBubbleToast("ריבוי פאנלים כבוי");
        document.querySelectorAll('.shift-details.expanded').forEach(el => {
            el.classList.remove('expanded');
        });
    }
};

window.toggleMonthAccordion = function(mk) {
    if (activeMonthKey === mk) {
        activeMonthKey = 'NONE'; 
    } else {
        activeMonthKey = mk; 
    }
    renderShifts();
};

window.printMonthReport = function(mk) {
    const mShifts = window.shifts.filter(s => s.date && s.date.startsWith(mk)).reverse(); 
    if(mShifts.length === 0) return;
    
    let totWorkMins = 0;
    let totPremMins = 0;
    let totNaltMins = 0;
    let tableRows = '';

    mShifts.forEach(s => {
         let wMins = 0;
         if(s.startTime && s.endTime) {
             wMins = window.calculateDurationMinutes(s.startTime, s.endTime);
             totWorkMins += wMins;
         }
         let pMins = 0;
         if(s.premStartTime && s.premEndTime) {
             pMins = window.calculateDurationMinutes(s.premStartTime, s.premEndTime);
             totPremMins += pMins;
         }
         const naltMins = (Number(s.naltStartMinutes)||0) + (Number(s.naltEndMinutes)||0);
         totNaltMins += naltMins;

         const dateParts = s.date.split('-');
         const dFmt = dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0];
         
         tableRows += '\
            <tr>\
                <td>' + dFmt + '</td>\
                <td>' + (s.siddur || '-') + '</td>\
                <td dir="ltr">' + (s.startTime || '-') + ' - ' + (s.endTime || '-') + '</td>\
                <td>' + (wMins > 0 ? formatMinutesToDisplay(wMins) : '-') + '</td>\
                <td>' + (pMins > 0 ? formatMinutesToDisplay(pMins) : '-') + '</td>\
                <td>' + (naltMins > 0 ? formatMinutesToDisplay(naltMins) : '-') + '</td>\
            </tr>\
         ';
    });

    const monthName = formatMonthName(mk);
    const printDiv = document.getElementById('printArea');
    printDiv.innerHTML = '\
        <div class="print-header">רכבת ישראל - סיכום משמרות לחודש ' + monthName + '</div>\
        <div class="print-summary-box">\
            <div class="print-summary-item">\
                <div class="print-summary-title">סה"כ שעות עבודה</div>\
                <div class="print-summary-val">' + window.formatMinutesToHM(totWorkMins) + '</div>\
            </div>\
            <div class="print-summary-item">\
                <div class="print-summary-title">סה"כ שעות פרמיה</div>\
                <div class="print-summary-val">' + window.formatMinutesToHM(totPremMins) + '</div>\
            </div>\
            <div class="print-summary-item">\
                <div class="print-summary-title">סה"כ זמן נל"ת</div>\
                <div class="print-summary-val">' + window.formatMinutesToHM(totNaltMins) + '</div>\
            </div>\
        </div>\
        <table class="print-table">\
            <thead>\
                <tr>\
                    <th>תאריך</th>\
                    <th>סידור/רכבת</th>\
                    <th>שעות משמרת</th>\
                    <th>משך עבודה</th>\
                    <th>שעות פרמיה</th>\
                    <th>זמן נל"ת</th>\
                </tr>\
            </thead>\
            <tbody>\
                ' + tableRows + '\
            </tbody>\
        </table>\
    ';

    const btn = document.getElementById('modalExportBtn');
    let originalHTML = '';
    if (btn) {
        originalHTML = btn.innerHTML;
        btn.classList.add('is-loading');
        btn.innerHTML = '<svg class="svg-icon rotating" width="18" height="18" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> <span>מייצר דוח...</span>';
    }

    const restoreBtn = () => {
        if (btn && originalHTML) {
            btn.classList.remove('is-loading');
            btn.innerHTML = originalHTML;
        }
        window.removeEventListener('afterprint', restoreBtn);
    };

    window.addEventListener('afterprint', restoreBtn, { once: true });
    setTimeout(restoreBtn, 4000);

    window.print();
};

window.sortShiftsByDate = function() {
    autoSortShiftsArray(window.shifts);
    localStorage.setItem('railway_shifts', JSON.stringify(window.shifts));
    renderShifts();
};

window.saveManualSorting = function() {
    const container = document.getElementById('shiftsContainer');
    const cardElements = Array.from(container.querySelectorAll('.shift-card'));
    const newOrderedShifts = [];

    cardElements.forEach(card => {
        const shiftId = card.getAttribute('data-id');
        const found = window.shifts.find(s => String(s.id) === String(shiftId));
        if (found) newOrderedShifts.push(found);
    });

    if (newOrderedShifts.length === window.shifts.length) {
        window.shifts = newOrderedShifts;
        localStorage.setItem('railway_shifts', JSON.stringify(window.shifts));
    }
    toggleSortingMode();
};

window.handleCardClick = function(event, id) {
    if (isSortingMode) return;
    if (event.target.closest('button') || event.target.closest('input') || event.target.closest('.checkbox-label-container')) return;

    const stringId = String(id);
    if (isSelectionMode) {
        if (selectedShiftIds.has(stringId)) {
            selectedShiftIds.delete(stringId);
        } else {
            selectedShiftIds.add(stringId);
        }
        updateSelectionUI();
        if (currentView === 'history') renderShifts();
    } else {
        const cardEl = event.currentTarget.closest('.shift-card');
        const detailsEl = cardEl.querySelector('.shift-details');
        if (!detailsEl) return;

        const isCurrentlyExpanded = detailsEl.classList.contains('expanded');

        if (currentView !== 'history' || !isMultiPanelMode) {
            if (!isCurrentlyExpanded) {
                const activeContainer = cardEl.closest('.shifts-list-inner') || cardEl.closest('.shifts-list');
                if (activeContainer) {
                    activeContainer.querySelectorAll('.shift-details.expanded').forEach(el => {
                        if (el !== detailsEl) el.classList.remove('expanded');
                    });
                }
            }
        }

        detailsEl.classList.toggle('expanded');
        if (detailsEl.classList.contains('expanded')) {
            setTimeout(() => cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
        }
    }
};

function updateSelectionUI() {
    const countText = document.getElementById('selectedCountText');
    countText.textContent = selectedShiftIds.size + ' נבחרו';
}

window.selectAllShifts = function() {
    if (selectedShiftIds.size === window.shifts.length) {
        selectedShiftIds.clear();
    } else {
        window.shifts.forEach(s => selectedShiftIds.add(String(s.id)));
    }
    updateSelectionUI();
    renderShifts();
};

window.deleteSelectedShifts = function() {
    if (selectedShiftIds.size === 0) return;
    
    showSmartAlertDialog(
        'מחיקת משמרות',
        'האם אתה בטוח שברצונך למחוק ' + selectedShiftIds.size + ' משמרות שנבחרו? פעולה זו אינה הפיכה.',
        'מחק הכל',
        'ביטול',
        () => {
            const idsToDelete = Array.from(selectedShiftIds);
            window.shifts = window.shifts.filter(s => !selectedShiftIds.has(String(s.id)));
            selectedShiftIds.clear();
            localStorage.setItem('railway_shifts', JSON.stringify(window.shifts));
            idsToDelete.forEach(id => deleteShiftFromCloudAndLocal(id));
            if (currentView === 'history') renderShifts();
            updateSelectionUI();
        },
        () => {}
    );
};

function setupDragAndDrop() {
    const lists = document.querySelectorAll('.shifts-list-inner');
    lists.forEach(container => {
        const cards = container.querySelectorAll('.shift-card');
        cards.forEach(card => {
            card.addEventListener('dragstart', (e) => {
                if (!isSortingMode) return;
                draggedElement = card;
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            card.addEventListener('dragend', () => {
                if (!isSortingMode) return;
                card.classList.remove('dragging');
                cards.forEach(c => c.classList.remove('drag-over'));
                draggedElement = null;
            });

            card.addEventListener('dragover', (e) => {
                if (!isSortingMode || !draggedElement || draggedElement === card) return;
                e.preventDefault();
                card.classList.add('drag-over');
            });

            card.addEventListener('dragleave', () => {
                card.classList.remove('drag-over');
            });

            card.addEventListener('drop', (e) => {
                if (!isSortingMode || !draggedElement || draggedElement === card) return;
                e.preventDefault();
                card.classList.remove('drag-over');

                const allCards = [...container.querySelectorAll('.shift-card')];
                const draggedIdx = allCards.indexOf(draggedElement);
                const targetIdx = allCards.indexOf(card);

                if (draggedIdx < targetIdx) {
                    container.insertBefore(draggedElement, card.nextSibling);
                } else {
                    container.insertBefore(draggedElement, card);
                }
            });

            const handle = card.querySelector('.drag-handle-container');
            if (handle) {
                let activeTouchCard = null;
                handle.addEventListener('touchstart', (e) => {
                    if (!isSortingMode) return;
                    e.stopPropagation();
                    activeTouchCard = card;
                    card.classList.add('dragging');
                }, { passive: false });

                handle.addEventListener('touchmove', (e) => {
                    if (!isSortingMode || !activeTouchCard) return;
                    e.preventDefault();
                    e.stopPropagation();

                    const touch = e.touches[0];
                    const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
                    const targetCard = targetEl ? targetEl.closest('.shift-card') : null;

                    if (targetCard && targetCard !== activeTouchCard && container.contains(targetCard)) {
                        const targetRect = targetCard.getBoundingClientRect();
                        const isAfter = touch.clientY > targetRect.top + targetRect.height / 2;
                        if (isAfter) {
                            container.insertBefore(activeTouchCard, targetCard.nextSibling);
                        } else {
                            container.insertBefore(activeTouchCard, targetCard);
                        }
                    }
                }, { passive: false });

                const stopTouch = (e) => {
                    if (activeTouchCard) {
                        e.stopPropagation();
                        activeTouchCard.classList.remove('dragging');
                        activeTouchCard = null;
                    }
                };
                handle.addEventListener('touchend', stopTouch);
                handle.addEventListener('touchcancel', stopTouch);
            }
        });
    });
}

function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function calculateFullPremTimes(startStr, endStr) {
    if (!startStr) return { start: '', end: '' };
    const sMins = timeToMinutes(startStr);
    
    if (endStr && startStr === endStr) {
        return { start: '', end: '' };
    }

    if (!endStr) {
        const pStartH = String(Math.floor((sMins % 1440) / 60)).padStart(2, '0');
        const pStartM = String((sMins % 1440) % 60).padStart(2, '0');
        return { start: pStartH + ':' + pStartM, end: '' };
    }

    let eMins = timeToMinutes(endStr);
    if (eMins <= sMins) eMins += 1440;

    let duration = eMins - sMins;
    if (duration > 720) {
        eMins = sMins + 720;
    }

    const pStartH = String(Math.floor((sMins % 1440) / 60)).padStart(2, '0');
    const pStartM = String((sMins % 1440) % 60).padStart(2, '0');
    const pEndH = String(Math.floor((eMins % 1440) / 60)).padStart(2, '0');
    const pEndM = String((eMins % 1440) % 60).padStart(2, '0');

    return {
        start: pStartH + ':' + pStartM,
        end: pEndH + ':' + pEndM
    };
}

function applyFullPremToShift(shift) {
    if (shift.startTime && shift.endTime && shift.startTime === shift.endTime) {
        shift.premStartTime = '';
        shift.premEndTime = '';
        return;
    }
    const times = calculateFullPremTimes(shift.startTime, shift.endTime);
    shift.premStartTime = times.start;
    shift.premEndTime = times.end;
}

window.onFullPremCheckboxChange = function(isChecked) {
    const startInput = document.getElementById('fieldStartTime').value;
    const endInput = document.getElementById('fieldEndTime').value;
    if (isChecked && startInput && (!endInput || startInput !== endInput)) {
        const times = calculateFullPremTimes(startInput, endInput);
        document.getElementById('fieldPremStart').value = times.start;
        document.getElementById('fieldPremEnd').value = times.end;
    } else if (!isChecked || (startInput && endInput && startInput === endInput)) {
        document.getElementById('fieldPremStart').value = '';
        document.getElementById('fieldPremEnd').value = '';
    }
    validateModalRealtime(true);
};

window.handleModalTimeChangeForFullPrem = function() {
    const isChecked = document.getElementById('fieldFullPremModal').checked;
    if (isChecked) {
        const startInput = document.getElementById('fieldStartTime').value;
        const endInput = document.getElementById('fieldEndTime').value;
        if (startInput && endInput && startInput !== endInput) {
            const times = calculateFullPremTimes(startInput, endInput);
            document.getElementById('fieldPremStart').value = times.start;
            document.getElementById('fieldPremEnd').value = times.end;
        } else {
            document.getElementById('fieldPremStart').value = startInput || '';
            document.getElementById('fieldPremEnd').value = '';
        }
    }
};

window.handleManualPremChange = function() {
    const checkbox = document.getElementById('fieldFullPremModal');
    if (checkbox && checkbox.checked) {
        checkbox.checked = false;
    }
};

window.handleFullPremClick = function(event, shiftId) {
    event.stopPropagation();
    event.preventDefault(); 

    const shift = window.shifts.find(s => String(s.id) === String(shiftId));
    if (!shift) return;

    const isChecking = !shift.fullPrem; 
    const hasManualPrem = Boolean(shift.premStartTime || shift.premEndTime); 

    if (isChecking && hasManualPrem) {
        showSmartAlertDialog(
            'עדכון נתוני פרמיה',
            'שים לב, קיימות נתוני פרמיה שהוזנו מראש. הפעלת "פרמיה מלאה" תעדכן נתונים אלו ותסנכרן אותם אוטומטית עם שעות המשמרת. האם להמשיך?',
            'עדכן וסנכרן',
            'ביטול',
            () => executeFullPremToggle(shift, true),
            () => {}
        );
    } else if (!isChecking && hasManualPrem) {
        showSmartAlertDialog(
            'מחיקת נתוני פרמיה',
            'ביטול סימון "פרמיה מלאה" יאפס את שעות הפרמיה המוגדרות כרגע. האם ברצונך להמשיך ולנקות את הנתונים?',
            'נקה נתונים',
            'ביטול',
            () => executeFullPremToggle(shift, false),
            () => {}
        );
    } else {
        executeFullPremToggle(shift, isChecking);
    }
};

function executeFullPremToggle(shift, isChecking) {
    shift.fullPrem = isChecking;
    if (isChecking) {
        if (shift.startTime && shift.startTime !== shift.endTime) {
            applyFullPremToShift(shift);
        }
    } else {
        shift.premStartTime = '';
        shift.premEndTime = '';
    }
    
    saveShifts(shift);
    if (currentView === 'history') renderShifts();
}

function buildShiftCardHTML(shift, overlappingIds) {
    const shiftIdStr = String(shift.id);
    const hasStart = Boolean(shift.startTime);
    const hasEnd = Boolean(shift.endTime);
    const isIncomplete = !hasStart || !hasEnd;
    const isActive = hasStart && !hasEnd;
    const isSelected = selectedShiftIds.has(shiftIdStr);
    const isOverlap = overlappingIds.has(shiftIdStr);

    const naltStart = Number(shift.naltStartMinutes ?? (shift.naltStartHours ? shift.naltStartHours * 60 : 0)) || 0;
    const naltEnd = Number(shift.naltEndMinutes ?? (shift.naltEndHours ? shift.naltEndHours * 60 : 0)) || 0;
    const totalNaltMins = naltStart + naltEnd;
    const hasNalt = totalNaltMins > 0;
    
    const hasPrem = Boolean(shift.premStartTime || shift.premEndTime);
    const hasInstructor = window.isUserInstructor && Boolean(shift.instructorStartTime || shift.instructorEndTime);
    const hasSiddur = Boolean(shift.siddur && shift.siddur.trim());
    const hasNotes = Boolean(shift.notes && shift.notes.trim());

    const { primary: siddurPrimary, secondary: siddurSecondary } = window.parseSiddurDisplay(shift.siddur);

    let secFontSize = '0.78rem';
    if (siddurSecondary.length > 24) {
        secFontSize = '0.62rem';
    } else if (siddurSecondary.length > 15) {
        secFontSize = '0.70rem';
    }

    const premDurationMins = (shift.premStartTime && shift.premEndTime) ? window.calculateDurationMinutes(shift.premStartTime, shift.premEndTime) : 0;
    const instructorDurationMins = (window.isUserInstructor && shift.instructorStartTime && shift.instructorEndTime) ? window.calculateDurationMinutes(shift.instructorStartTime, shift.instructorEndTime) : 0;

    const parts = (shift.date || '').split('-');
    const daysArr = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const dObj = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();
    const dayName = 'יום ' + daysArr[dObj.getDay()];
    const dateFmt = parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : '--/--/----';

    let naltStartRange = '';
    if (hasStart && naltStart > 0) {
        naltStartRange = shift.startTime + ' – ' + addMinutesToTime(shift.startTime, naltStart);
    }

    let naltEndRange = '';
    if (hasEnd && naltEnd > 0) {
        naltEndRange = subtractMinutesFromTime(shift.endTime, naltEnd) + ' – ' + shift.endTime;
    }

    let shiftTypeClass = '';
    if (hasStart) {
        if (hasEnd && shift.startTime === '06:00' && shift.endTime === '18:00') {
            shiftTypeClass = 'type-morning';
        } else if (hasEnd && (shift.startTime === '18:00' && shift.endTime === '06:00' || (shift.startTime === '18:00' && shift.endTime === '23:59'))) {
            shiftTypeClass = 'type-night';
        } else {
            const startMins = timeToMinutes(shift.startTime);
            const endMins = hasEnd ? timeToMinutes(shift.endTime) : -1;
            const realEndMins = (endMins !== -1 && endMins < startMins) ? endMins + 1440 : endMins;

            if (startMins >= 180 && startMins <= 600 && (realEndMins === -1 || realEndMins <= 1050)) {
                shiftTypeClass = 'type-morning';
            } else if (startMins > 600 && startMins <= 1080 && (realEndMins === -1 || realEndMins <= 1350)) {
                shiftTypeClass = 'type-noon';
            } else if (startMins >= 1080 && startMins <= 1439) {
                shiftTypeClass = 'type-night';
            }
        }
    }

    let morningSvg = '<g fill="none" stroke-width="2" stroke-linecap="round"><path d="M3 14h18M7 14a5 5 0 0 1 10 0" stroke="url(#combined-grad-' + shiftIdStr + ')"/><path d="M12 3v4M6.34 5.34l2.12 2.12M17.66 5.34l-2.12 2.12M3.5 10h3M20.5 10h-3" stroke="url(#sun-grad-' + shiftIdStr + ')"/><path d="M5 18h14M8 21h8" stroke="url(#morning-grad-' + shiftIdStr + ')"/></g>';
    let noonSvg = '<g fill="url(#noon-grad-' + shiftIdStr + ')" stroke="url(#noon-grad-' + shiftIdStr + ')"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" fill="none" stroke-width="2" stroke-linecap="round"/></g>';
    let nightSvg = '<g><circle cx="11.5" cy="12" r="8" fill="url(#night-grad-' + shiftIdStr + ')" mask="url(#moon-mask-' + shiftIdStr + ')"/><path d="M19 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2zM14 10l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5.5-1zM18.5 13l.4.8.8.4-.8.4-.4.8-.4-.8-.8-.4.8-.4.4-.8z" fill="url(#night-grad-' + shiftIdStr + ')" stroke="none"/></g>';

    let cornerIconInner = '';
    if (shiftTypeClass === 'type-morning') cornerIconInner = morningSvg;
    else if (shiftTypeClass === 'type-noon') cornerIconInner = noonSvg;
    else if (shiftTypeClass === 'type-night') cornerIconInner = nightSvg;

    const naltSvgIcon = '<svg class="svg-icon" width="13" height="13" viewBox="0 0 24 24"><path fill="currentColor" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.22.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM19 17H5v-4.66l.12-.34h13.76l.12.34V17z"/><circle fill="currentColor" cx="7.5" cy="14.5" r="1.5"/><circle fill="currentColor" cx="16.5" cy="14.5" r="1.5"/></svg>';
    const premSvgIcon = '<svg class="svg-icon" width="13" height="13" viewBox="0 0 24 24"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
    const instructorSvgIcon = '<svg class="svg-icon" width="13" height="13" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>';
    const notesSvgIcon = '<svg class="svg-icon" width="13" height="13" viewBox="0 0 24 24"><path fill="currentColor" d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>';
    const clockCheckSvg = '<svg class="svg-icon tag-clock-icon" width="14" height="14" viewBox="0 0 24 24"><path d="M5.7 14.2A8 8 0 1 1 13 19"/><path d="M13 6v5h4.5"/><path d="M4.5 17.2l2.3 2.3 4.3-4.3"/></svg>';
    const clockAlertSvg = '<svg class="svg-icon tag-clock-icon" width="14" height="14" viewBox="0 0 24 24"><path d="M5.3 12.8A8 8 0 1 1 14.2 18.9"/><path d="M13 6v5h4.5"/><path class="triangle-fill" fill-rule="evenodd" d="M7.8 13.5L12 21H3.6ZM7.2 15.8H8.4V18.4H7.2ZM7.2 19.4H8.4V20.6H7.2Z"/></svg>';

    return '\
        <div class="shift-card ' + shiftTypeClass + ' ' + (isActive ? 'active-shift' : '') + ' ' + (isOverlap ? 'has-overlap' : '') + ' ' + (isIncomplete && !isActive ? 'incomplete' : '') + ' ' + (isSelected ? 'selected-for-delete' : '') + '" \
             data-id="' + shiftIdStr + '" \
             draggable="' + (isSortingMode ? 'true' : 'false') + '">\
            \
            <div class="shift-corner-icon">\
                <svg viewBox="0 0 24 24">\
                    <defs>\
                        <linearGradient id="morning-grad-' + shiftIdStr + '" x1="0%" y1="0%" x2="100%" y2="100%">\
                            <stop offset="0%" stop-color="#38bdf8"/>\
                            <stop offset="50%" stop-color="#0ea5e9"/>\
                            <stop offset="100%" stop-color="#0369a1"/>\
                        </linearGradient>\
                        <linearGradient id="combined-grad-' + shiftIdStr + '" x1="0%" y1="0%" x2="0%" y2="100%">\
                            <stop offset="0%" stop-color="#fde047"/>\
                            <stop offset="25%" stop-color="#fb923c"/>\
                            <stop offset="50%" stop-color="#ef4444"/>\
                            <stop offset="51%" stop-color="#38bdf8"/>\
                            <stop offset="100%" stop-color="#0369a1"/>\
                        </linearGradient>\
                        <linearGradient id="sun-grad-' + shiftIdStr + '" x1="0%" y1="0%" x2="100%" y2="100%">\
                            <stop offset="0%" stop-color="#fde047"/>\
                            <stop offset="35%" stop-color="#f97316"/>\
                            <stop offset="100%" stop-color="#e11d48"/>\
                        </linearGradient>\
                        <linearGradient id="noon-grad-' + shiftIdStr + '" x1="0%" y1="0%" x2="100%" y2="100%">\
                            <stop offset="0%" stop-color="#fed7aa"/>\
                            <stop offset="50%" stop-color="#f97316"/>\
                            <stop offset="100%" stop-color="#c2410c"/>\
                        </linearGradient>\
                        <linearGradient id="night-grad-' + shiftIdStr + '" x1="0%" y1="0%" x2="100%" y2="100%">\
                            <stop offset="0%" stop-color="#e879f9"/>\
                            <stop offset="50%" stop-color="#a855f7"/>\
                            <stop offset="100%" stop-color="#7e22ce"/>\
                        </linearGradient>\
                        <mask id="moon-mask-' + shiftIdStr + '">\
                            <rect width="24" height="24" fill="white"/>\
                            <circle cx="15.5" cy="11.5" r="7.5" fill="black"/>\
                        </mask>\
                    </defs>\
                    ' + cornerIconInner + '\
                </svg>\
            </div>\
            \
            <div class="shift-header" onclick="handleCardClick(event, \'' + shiftIdStr + '\')">\
                <div class="drag-handle-container">\
                    <svg class="svg-icon" width="20" height="20" viewBox="0 0 24 24" style="color: var(--text-muted);">\
                        <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>\
                        <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>\
                        <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>\
                    </svg>\
                </div>\
                <div class="select-checkbox-container">\
                    <div class="custom-checkbox">\
                        <svg class="svg-icon" width="14" height="14" viewBox="0 0 24 24">\
                            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>\
                        </svg>\
                    </div>\
                </div>\
                <div class="shift-content-block">\
                    <div class="shift-row-main">\
                        <div class="shift-date-box" style="margin-left: 10px;">\
                            <span class="shift-day-name">' + dayName + '</span>\
                            <span class="shift-formatted-date">' + dateFmt + '</span>\
                        </div>\
                        <div class="shift-middle-box">\
                            ' + (hasSiddur ? '<span class="shift-siddur-primary" style="' + (siddurPrimary.length > 10 ? 'font-size: 0.85rem;' : '') + '">' + siddurPrimary + '</span>' + (siddurSecondary ? '<span class="shift-siddur-secondary" style="font-size: ' + secFontSize + ';">' + siddurSecondary + '</span>' : '') : '') + '\
                        </div>\
                        <div class="shift-hours-summary">\
                            <div class="shift-time-range">' + (shift.startTime || '--:--') + ' - ' + (shift.endTime || '--:--') + '</div>\
                            <div class="shift-total-duration">' + calculateDuration(shift.startTime, shift.endTime) + '</div>\
                        </div>\
                    </div>\
                    <div class="shift-badges-row">\
                        <div class="badges-group-right">\
                            ' + (hasNalt ? '<span class="tag tag-nalt">' + naltSvgIcon + ' נל״ת</span>' : '') + '\
                            ' + (hasPrem ? '<span class="tag tag-prem">' + premSvgIcon + ' פרמיה</span>' : '') + '\
                            ' + (hasInstructor ? '<span class="tag tag-instructor">' + instructorSvgIcon + ' הדרכה</span>' : '') + '\
                            ' + (hasNotes ? '<span class="tag tag-notes" title="הערות">' + notesSvgIcon + '</span>' : '') + '\
                        </div>\
                        <div class="badges-group-left">\
                            ' + (hasStart && hasEnd ? '<span class="tag tag-complete" title="משמרת סגורה">' + clockCheckSvg + '</span>' : '<span class="tag tag-alert" title="נתונים חסרים">' + clockAlertSvg + '</span>') + '\
                            ' + (isOverlap ? '<span class="tag tag-overlap">כפילות</span>' : '') + '\
                        </div>\
                    </div>\
                </div>\
            </div>\
            \
            <div class="shift-details" id="details_' + shiftIdStr + '">\
                <div>\
                    <div class="details-inner">\
                        ' + (isOverlap ? '\
                        <div class="sub-breakdown" style="border-color: rgba(234, 179, 8, 0.3);">\
                            <div class="breakdown-item" style="color: var(--accent-yellow); border-bottom: none; padding-bottom: 0;">\
                                <span class="breakdown-label" style="color: var(--accent-yellow); display: flex; align-items: center; gap: 4px;">\
                                    <svg class="svg-icon" width="14" height="14" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>\
                                    שים לב:\
                                </span>\
                                <span class="breakdown-value" style="color: var(--accent-yellow); font-family: \'Assistant\', sans-serif;">קיימת חפיפת שעות עם משמרת נוספת</span>\
                            </div>\
                        </div>' : '') + '\
                        \
                        <div class="sub-breakdown">\
                            ' + (hasSiddur ? '\
                            <div class="breakdown-item-siddur">\
                                <span class="breakdown-label">סידור:</span>\
                                <span class="breakdown-value-center">' + shift.siddur + '</span>\
                                <div></div>\
                            </div>' : '') + '\
                            <div class="breakdown-item-duo" style="display: flex; justify-content: space-between; align-items: center;">\
                                <div class="duo-col" style="flex: 1;">\
                                    <span class="breakdown-label">כניסה:</span>\
                                    <span class="breakdown-value">' + (shift.startTime || 'לא הוזן') + '</span>\
                                    <span class="breakdown-label" style="margin-right: 8px;">יציאה:</span>\
                                    <span class="breakdown-value">' + (shift.endTime || 'לא הוזן') + '</span>\
                                </div>\
                                <div class="checkbox-label-container" onclick="handleFullPremClick(event, \'' + shiftIdStr + '\')" style="margin-right: auto;">\
                                    <input type="checkbox" ' + (shift.fullPrem ? 'checked' : '') + ' style="pointer-events: none;" tabindex="-1">\
                                    <span>פרמיה מלאה</span>\
                                </div>\
                            </div>\
                        </div>\
                        \
                        ' + (hasNalt ? '\
                        <div class="sub-breakdown">\
                            ' + (naltStart > 0 ? '\
                            <div class="breakdown-item">\
                                <span class="breakdown-label">נל״ת הלוך (' + window.formatMinutesToHM(naltStart) + '):</span>\
                                <span class="breakdown-value">' + naltStartRange + '</span>\
                            </div>' : '') + '\
                            ' + (naltEnd > 0 ? '\
                            <div class="breakdown-item">\
                                <span class="breakdown-label">נל״ת חזור (' + window.formatMinutesToHM(naltEnd) + '):</span>\
                                <span class="breakdown-value">' + naltEndRange + '</span>\
                            </div>' : '') + '\
                        </div>' : '') + '\
                        \
                        ' + (hasPrem ? '\
                        <div class="sub-breakdown">\
                            <div class="breakdown-item">\
                                <span class="breakdown-label">פרמיה ' + (premDurationMins > 0 ? '(' + window.formatMinutesToHM(premDurationMins) + ')' : '') + ':</span>\
                                <span class="breakdown-value">' + (shift.premStartTime || '---') + ' – ' + (shift.premEndTime || '---') + '</span>\
                            </div>\
                        </div>' : '') + '\
                        \
                        ' + (window.isUserInstructor && hasInstructor ? '\
                        <div class="sub-breakdown" style="border-color: rgba(56, 189, 248, 0.2);">\
                            <div class="breakdown-item">\
                                <span class="breakdown-label" style="color: var(--accent-instructor);">פרמיית הדרכה ' + (instructorDurationMins > 0 ? '(' + window.formatMinutesToHM(instructorDurationMins) + ')' : '') + ':</span>\
                                <span class="breakdown-value">' + (shift.instructorStartTime || '---') + ' – ' + (shift.instructorEndTime || '---') + '</span>\
                            </div>\
                        </div>' : '') + '\
                        \
                        ' + (hasNotes ? '\
                        <div class="notes-display-box">\
                            <svg class="svg-icon" width="14" height="14" viewBox="0 0 24 24" style="flex-shrink: 0; margin-top: 2px; color: var(--text-muted);"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>\
                            <span style="flex: 1;">' + shift.notes + '</span>\
                        </div>' : '') + '\
                        \
                        <div class="card-actions-bar">\
                            <button class="btn-secondary" onclick="event.stopPropagation(); openShiftModal(\'' + shiftIdStr + '\')">עריכה / השלמת חוסר</button>\
                            <button class="btn-secondary btn-danger-outline" onclick="event.stopPropagation(); deleteShift(\'' + shiftIdStr + '\')">מחיקה</button>\
                        </div>\
                    </div>\
                </div>\
            </div>\
        </div>\
    ';
}

function renderShifts() {
    const container = document.getElementById('shiftsContainer');
    if (!container) return;

    const expandedIds = Array.from(container.querySelectorAll('.shift-details.expanded'))
                            .map(el => el.closest('.shift-card').getAttribute('data-id'));

    if (window.shifts.length === 0) {
        container.innerHTML = '\
            <div class="empty-state">\
                <p>עדיין אין משמרות מתועדות.<br>לחץ על "כניסה למשמרת" כדי להתחיל.</p>\
            </div>\
        ';
        return;
    }

    const overlappingIds = calculateOverlaps();
    
    let grouped = {};
    window.shifts.forEach(s => {
        const d = s.date || '';
        const monthKey = d.substring(0, 7); 
        if(!grouped[monthKey]) grouped[monthKey] = [];
        grouped[monthKey].push(s);
    });
    
    const monthKeys = Object.keys(grouped).sort((a,b) => b.localeCompare(a));
    
    if (activeMonthKey !== 'NONE' && (!activeMonthKey || !monthKeys.includes(activeMonthKey))) {
        activeMonthKey = monthKeys[0] || '';
    }

    let html = '';
    monthKeys.forEach(mk => {
        const mShifts = grouped[mk];
        const isOpen = (mk === activeMonthKey);

        html += '\
        <div class="month-accordion-wrapper ' + (isOpen ? 'open' : '') + '">\
            <div class="month-accordion-header" onclick="toggleMonthAccordion(\'' + mk + '\')">\
                <div class="month-header-left-actions" onclick="event.stopPropagation()">\
                    <button class="btn-summary-modal" data-action="summary" data-month="' + mk + '" title="סיכום חודשי">\
                        <svg viewBox="0 0 24 24">\
                            <line x1="6" y1="20" x2="6" y2="10"></line>\
                            <line x1="12" y1="20" x2="12" y2="4"></line>\
                            <line x1="18" y1="20" x2="18" y2="14"></line>\
                        </svg>\
                        <span class="drawer-tooltip">סיכום חודשי</span>\
                    </button>\
                </div>\
                <span>' + formatMonthName(mk) + ' <span style="font-size: 0.8rem; font-weight: normal; color: var(--text-muted);">(' + mShifts.length + ' משמרות)</span></span>\
                <svg class="chevron-icon" width="20" height="20" viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>\
            </div>\
            <div class="month-accordion-body">\
                <div class="shifts-list-inner">\
                    ' + mShifts.map(shift => buildShiftCardHTML(shift, overlappingIds)).join('') + '\
                </div>\
            </div>\
        </div>';
    });

    container.innerHTML = html;
    
    expandedIds.forEach(id => {
        const card = container.querySelector('.shift-card[data-id="' + id + '"]');
        if (card) {
            const details = card.querySelector('.shift-details');
            if (details) details.classList.add('expanded');
        }
    });

    setupDragAndDrop();
    setupGlobalInteractions();
}

function getValidationState() {
    const shiftStart = document.getElementById('fieldStartTime').value || '';
    const shiftEnd = document.getElementById('fieldEndTime').value || '';
    const premStart = document.getElementById('fieldPremStart').value || '';
    const premEnd = document.getElementById('fieldPremEnd').value || '';

    let startInvalid = false;
    let endInvalid = false;
    let bothEmptyInvalid = false;
    let premStartInvalid = false;
    let premEndInvalid = false;
    let shiftErrorMsg = '';
    let premErrorMsg = '';

    if (!shiftStart && !shiftEnd) {
        startInvalid = true;
        endInvalid = true;
        bothEmptyInvalid = true;
        shiftErrorMsg = 'חסרה שעת כניסה או יציאה';
    } else if (shiftStart && shiftEnd && shiftStart === shiftEnd) {
        startInvalid = true;
        endInvalid = true;
        shiftErrorMsg = 'שעות כניסה ויציאה זהות';
    } else if (shiftStart && shiftEnd) {
        let sStartMins = timeToMinutes(shiftStart);
        let sEndMins = timeToMinutes(shiftEnd);
        if (sEndMins <= sStartMins) sEndMins += 1440;
        if (sEndMins - sStartMins > 780) {
            startInvalid = true;
            endInvalid = true;
            shiftErrorMsg = 'חריגה מ-13 שעות';
        }
    }

    let sStartMins = timeToMinutes(shiftStart);
    let sEndMins = shiftEnd ? timeToMinutes(shiftEnd) : sStartMins + 1440;
    if (shiftStart && shiftEnd && sEndMins <= sStartMins) sEndMins += 1440;
    if (!shiftStart && shiftEnd) sStartMins = sEndMins - 1440;
    
    let adjustedSStart = sStartMins;
    let adjustedSEnd = sEndMins;

    if (premStart && (shiftStart || shiftEnd)) {
        let pStartMins = timeToMinutes(premStart);
        while (pStartMins < adjustedSStart) pStartMins += 1440;
        if (pStartMins < adjustedSStart || pStartMins > adjustedSEnd) {
            premStartInvalid = true;
            premErrorMsg = 'תחילת הפרמיה חורגת מהמשמרת';
        }
    }

    if (premEnd && (shiftEnd || shiftStart)) {
        let pEndMins = timeToMinutes(premEnd);
        while (pEndMins < adjustedSStart) pEndMins += 1440;
        if (pEndMins > adjustedSEnd) {
            premEndInvalid = true;
            premErrorMsg = 'סיום הפרמיה חורג מהמשמרת';
        }
    }

    if (premStart && premEnd) {
        let pStartMins = timeToMinutes(premStart);
        while (pStartMins < adjustedSStart) pStartMins += 1440;
        let pEndMins = timeToMinutes(premEnd);
        while (pEndMins < adjustedSStart) pEndMins += 1440;
        
        let premDuration = pEndMins - pStartMins;
        if (premDuration < 0) premDuration += 1440;
        let shiftDuration = adjustedSEnd - adjustedSStart;
        
        if (premDuration > shiftDuration + 2 || premDuration === 0) {
            premStartInvalid = true;
            premEndInvalid = true;
            premErrorMsg = 'זמני הפרמיה שגויים';
        }
    }

    return {
        valid: !startInvalid && !endInvalid && !premStartInvalid && !premEndInvalid,
        startInvalid,
        endInvalid,
        bothEmptyInvalid,
        premStartInvalid,
        premEndInvalid,
        shiftError: shiftErrorMsg,
        premError: premErrorMsg
    };
}

window.saveShiftDirect = function() {
    const editId = document.getElementById('editShiftId').value;
    const siddurVal = document.getElementById('fieldSiddur').value.trim();
    let dateVal = document.getElementById('fieldDate').value;
    if (!dateVal) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        dateVal = y + '-' + m + '-' + d;
    }

    const startVal = document.getElementById('fieldStartTime').value || null;
    const endVal = document.getElementById('fieldEndTime').value || null;
    const naltStartVal = window.getNaltFieldValue('Start');
    const naltEndVal = window.getNaltFieldValue('End');
    const fullPremVal = document.getElementById('fieldFullPremModal').checked;
    const premStartVal = document.getElementById('fieldPremStart').value || '';
    const premEndVal = document.getElementById('fieldPremEnd').value || '';
    const instructorStartVal = window.isUserInstructor ? (document.getElementById('fieldInstructorStart').value || '') : '';
    const instructorEndVal = window.isUserInstructor ? (document.getElementById('fieldInstructorEnd').value || '') : '';
    const notesVal = document.getElementById('fieldNotes').value.trim();

    const validation = getValidationState();
    
    if (!validation.valid) {
        window.validateModalRealtime(true);
        let errorMsg = 'לא ניתן לשמור את המשמרת – יש לתקן את השדות המסומנים באדום.';
        let errorTitle = 'שגיאה בנתוני המשמרת';
        
        if (validation.bothEmptyInvalid) errorTitle = 'נתונים חסרים';
        else if (validation.shiftError && validation.shiftError.includes('13')) errorTitle = 'חריגת משך משמרת';
        else if (validation.premStartInvalid || validation.premEndInvalid) errorTitle = 'שגיאה בשמירת נתוני הפרמיה';
        
        showErrorDialog(errorMsg, errorTitle);
        return;
    }

    let savedShiftObj = null;

    if (editId) {
        const index = window.shifts.findIndex(s => String(s.id) === String(editId));
        if (index !== -1) {
            window.shifts[index] = {
                ...window.shifts[index],
                siddur: siddurVal,
                date: dateVal,
                startTime: startVal,
                endTime: endVal,
                naltStartMinutes: naltStartVal,
                naltEndMinutes: naltEndVal,
                fullPrem: fullPremVal,
                premStartTime: premStartVal,
                premEndTime: premEndVal,
                instructorStartTime: instructorStartVal,
                instructorEndTime: instructorEndVal,
                notes: notesVal
            };
            if (fullPremVal && startVal && startVal !== endVal) {
                applyFullPremToShift(window.shifts[index]);
            }
            savedShiftObj = window.shifts[index];
        }
    } else {
        const newShift = {
            id: 'shift_' + Date.now(),
            siddur: siddurVal,
            date: dateVal,
            startTime: startVal,
            endTime: endVal,
            naltStartMinutes: naltStartVal,
            naltEndMinutes: naltEndVal,
            fullPrem: fullPremVal,
            premStartTime: premStartVal,
            premEndTime: premEndVal,
            instructorStartTime: instructorStartVal,
            instructorEndTime: instructorEndVal,
            notes: notesVal
        };
        if (fullPremVal && startVal && startVal !== endVal) {
            applyFullPremToShift(newShift);
        }
        window.shifts.unshift(newShift);
        savedShiftObj = newShift;
    }
    
    activeMonthKey = dateVal.substring(0, 7);

    autoSortShiftsArray(window.shifts);
    saveShifts(savedShiftObj);
    if (currentView === 'history') renderShifts();
    closeModal();
};

window.deleteShift = function(id) {
    showSmartAlertDialog(
        'מחיקת משמרת',
        'האם אתה בטוח שברצונך למחוק משמרת זו מהיומן? פעולה זו אינה הפיכה.',
        'מחק משמרת',
        'ביטול',
        () => {
            window.shifts = window.shifts.filter(s => !selectedShiftIds.has(String(s.id)) && String(s.id) !== String(id));
            localStorage.setItem('railway_shifts', JSON.stringify(window.shifts));
            deleteShiftFromCloudAndLocal(id);
            if (currentView === 'history') renderShifts();
        },
        () => {}
    );
};

window.openShiftModal = function(shiftId) {
    const modal = document.getElementById('shiftModal');
    const title = document.getElementById('modalTitle');
    const instructorSection = document.getElementById('instructorSectionModal');

    if (window.isUserInstructor) {
        instructorSection.style.display = 'block';
    } else {
        instructorSection.style.display = 'none';
    }

    if (shiftId) {
        const shift = window.shifts.find(s => String(s.id) === String(shiftId));
        if (!shift) return;
        title.textContent = 'עריכת משמרת';
        document.getElementById('editShiftId').value = String(shift.id);
        document.getElementById('fieldSiddur').value = shift.siddur || '';
        document.getElementById('fieldDate').value = shift.date || '';
        document.getElementById('fieldStartTime').value = shift.startTime || '';
        document.getElementById('fieldEndTime').value = shift.endTime || '';
        document.getElementById('fieldFullPremModal').checked = Boolean(shift.fullPrem);
        document.getElementById('fieldNotes').value = shift.notes || '';
        
        const nStartMins = shift.naltStartMinutes ?? (shift.naltStartHours ? shift.naltStartHours * 60 : 0);
        const nEndMins = shift.naltEndMinutes ?? (shift.naltEndHours ? shift.naltEndHours * 60 : 0);
        
        window.setNaltFieldUI('Start', nStartMins);
        window.setNaltFieldUI('End', nEndMins);
        document.getElementById('fieldPremStart').value = shift.premStartTime || '';
        document.getElementById('fieldPremEnd').value = shift.premEndTime || '';
        if (window.isUserInstructor) {
            document.getElementById('fieldInstructorStart').value = shift.instructorStartTime || '';
            document.getElementById('fieldInstructorEnd').value = shift.instructorEndTime || '';
        }
    } else {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');

        title.textContent = 'הוספת משמרת ידנית';
        document.getElementById('editShiftId').value = '';
        document.getElementById('fieldSiddur').value = '';
        document.getElementById('fieldDate').value = y + '-' + m + '-' + d;
        document.getElementById('fieldStartTime').value = '';
        document.getElementById('fieldEndTime').value = '';
        document.getElementById('fieldFullPremModal').checked = false;
        document.getElementById('fieldNotes').value = '';
        window.setNaltFieldUI('Start', 0);
        window.setNaltFieldUI('End', 0);
        document.getElementById('fieldPremStart').value = '';
        document.getElementById('fieldPremEnd').value = '';
        if (window.isUserInstructor) {
            document.getElementById('fieldInstructorStart').value = '';
            document.getElementById('fieldInstructorEnd').value = '';
        }
    }

    modal.classList.add('open');
    window.validateModalRealtime(false);
};

window.closeModal = function() {
    document.getElementById('shiftModal').classList.remove('open');
};

function initBackdropScrollPrevention() {
    const overlays = document.querySelectorAll(
        '.modal-overlay, .error-dialog-overlay, .perm-modal-overlay, .menu-backdrop, .tools-drawer-backdrop'
    );
    overlays.forEach(overlay => {
        overlay.addEventListener('touchmove', (e) => {
            if (e.target === overlay) {
                e.preventDefault();
            }
        }, { passive: false });
    });

    const nonScrollableCards = document.querySelectorAll(
        '.error-dialog-card, .perm-modal-card, .user-dropdown-menu, .tools-popup-drawer'
    );
    nonScrollableCards.forEach(card => {
        card.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
    });

    const observer = new MutationObserver(() => {
        if (window.updateBodyScrollLock) window.updateBodyScrollLock();
    });
    overlays.forEach(overlay => {
        observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    });

    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('toolsDrawerWrap');
        if (wrap && wrap.classList.contains('open')) {
            if (!wrap.contains(e.target)) {
                window.toggleToolsDrawer(false);
                e.stopPropagation();
                e.preventDefault();
            }
        }
    }, true);
}

initBackdropScrollPrevention();
setupGlobalInteractions();
window.navigateTo(currentView, false);
