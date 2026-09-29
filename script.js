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

onAuthStateChanged(auth, async (user) => {
    window.currentUser = user;
    const btnText = document.getElementById('authBtnText');
    const authContainer = document.getElementById('headerAuthContainer');

    if (user) {
        const displayName = user.displayName ? user.displayName.split(' ')[0] : 'מחובר';
        btnText.textContent = displayName;
        authContainer.classList.add('logged-in');
        
        await checkInstructorPermission(user.uid);
        await handleUserAuthenticationSync(user.uid);

        try {
            await setDoc(doc(db, 'app_users', user.uid), {
                email: user.email || 'לא ידוע',
                name: user.displayName || 'משתמש',
                lastLogin: new Date().toISOString()
            }, { merge: true });
        } catch (err) {
            console.error("Error logging user:", err);
        }

    } else {
        window.isUserInstructor = false;
        btnText.textContent = 'התחברות';
        authContainer.classList.remove('logged-in');
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

        if (window.currentUser.uid === OWNER_UID) {
            ownerBtn.style.display = 'block';
            ownerToggleContainer.style.display = 'block';
            document.getElementById('ownerInstructorToggle').checked = window.isUserInstructor;
        } else {
            ownerBtn.style.display = 'none';
            ownerToggleContainer.style.display = 'none';
        }

        populateProfileMonthSelector();
        updateProfileSummaryData();
    }
    navigateTo('profile');
};

window.openSettingsModal = function() {
    const dropdown = document.getElementById('userDropdownMenu');
    if (dropdown) dropdown.classList.remove('open');
    document.getElementById('settingsModal').classList.add('open');
};

window.closeSettingsModal = function() {
    document.getElementById('settingsModal').classList.remove('open');
    const dropdown = document.getElementById('userDropdownMenu');
    const backdrop = document.getElementById('menuBackdrop');
    if (dropdown) dropdown.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
};

window.confirmSignOut = function() {
    const dropdown = document.getElementById('userDropdownMenu');
    const backdrop = document.getElementById('menuBackdrop');
    if (dropdown) dropdown.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');

    showSmartAlertDialog(
        'התנתקות מהמערכת',
        'האם אתה בטוח שברצונך להתנתק? (הנתונים במכשיר יאופסו, אך ישארו שמורים בענן).',
        'התנתק',
        'ביטול',
        async () => {
            try {
                if (backdrop) backdrop.classList.remove('open');
                if (dropdown) dropdown.classList.remove('open');

                await signOut(auth);
                window.shifts = [];
                window.isUserInstructor = false;
                localStorage.removeItem('railway_shifts');
                localStorage.removeItem('railway_last_user');
                refreshUIAfterSync();
            } catch (error) {
                console.error(error);
            }
        },
        () => {
            if (backdrop) backdrop.classList.remove('open');
            if (dropdown) dropdown.classList.remove('open');
        }
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
    
    listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">טוען משתמשים...</div>';

    try {
        const usersSnap = await getDocs(collection(db, 'app_users'));
        const instructorsSnap = await getDocs(collection(db, 'instructors'));
        
        let instructorsMap = {};
        instructorsSnap.forEach(docSnap => {
            instructorsMap[docSnap.id] = docSnap.data().active === true;
        });

        let html = '';
        let count = 0;

        usersSnap.forEach(docSnap => {
            const uId = docSnap.id;
            if (uId === OWNER_UID) return;

            count++;
            const uData = docSnap.data();
            const isInst = Boolean(instructorsMap[uId]);
            const userEmail = uData.email || 'לא ידוע';

            const copySvg = '<svg class="svg-icon" width="13" height="13" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

            html += '\
                <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;">\
                    <div style="display: flex; justify-content: space-between; align-items: center;">\
                        <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">\
                            <span style="font-size: 0.9rem; font-weight: 700; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + userEmail + '</span>\
                            <button class="btn-secondary copy-icon-btn" onclick="navigator.clipboard.writeText(\'' + userEmail + '\')" title="העתק מייל">' + copySvg + '</button>\
                        </div>\
                        <span style="font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: ' + (isInst ? 'rgba(16,185,129,0.15); color: var(--accent-green);' : 'rgba(148,163,184,0.1); color: var(--text-muted);') + '">\
                            ' + (isInst ? 'מדריך פעיל' : 'משתמש רגיל') + '\
                        </span>\
                    </div>\
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">\
                        <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">\
                            <span style="font-size: 0.72rem; color: var(--text-muted); font-family: monospace; direction: ltr; overflow: hidden; text-overflow: ellipsis;">' + uId + '</span>\
                            <button class="btn-secondary copy-icon-btn" onclick="navigator.clipboard.writeText(\'' + uId + '\')" title="העתק UID">' + copySvg + '</button>\
                        </div>\
                        <button class="btn-secondary" style="padding: 5px 12px; font-size: 0.78rem; font-weight: 700; white-space: nowrap; width: auto; background: ' + (isInst ? 'rgba(239,68,68,0.2); color:#fca5a5; border-color: rgba(239,68,68,0.4);' : 'rgba(16,185,129,0.2); color:#34d399; border-color: rgba(16,185,129,0.4);') + ';" onclick="toggleInstructorStatus(\'' + uId + '\', ' + (!isInst) + ')">\
                            ' + (isInst ? 'ביטול הרשאה' : 'מתן הרשאה') + '\
                        </button>\
                    </div>\
                </div>\
            ';
        });

        if (count === 0) {
            listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">אין עדיין משתמשים נוספים במערכת</div>';
        } else {
            listContainer.innerHTML = html;
        }
    } catch (err) {
        console.error("Error loading users:", err);
        listContainer.innerHTML = '<div style="text-align: center; color: var(--accent-red); padding: 20px;">שגיאה בטעינת משתמשים</div>';
    }
};

window.toggleInstructorStatus = async function(uid, makeActive) {
    try {
        await setDoc(doc(db, 'instructors', uid), { active: makeActive }, { merge: true });
        loadAdminUsersList();
    } catch (err) {
        console.error("Error updating instructor:", err);
        showErrorDialog('שגיאה בעדכון ההרשאה');
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
    currentView = viewName;
    sessionStorage.setItem('railway_active_view', viewName);

    window.closeUserMenu();
    const toolsWrap = document.getElementById('toolsDrawerWrap');
    if (toolsWrap) toolsWrap.classList.remove('open');

    const authContainer = document.getElementById('headerAuthContainer');
    if (authContainer) {
        if (viewName === 'profile' || viewName === 'admin') {
            authContainer.classList.add('disabled-profile');
        } else {
            authContainer.classList.remove('disabled-profile');
        }
    }

    document.getElementById('viewClock').style.display = (viewName === 'clock') ? 'flex' : 'none';
    document.getElementById('viewHistory').style.display = (viewName === 'history') ? 'flex' : 'none';
    document.getElementById('viewProfile').style.display = (viewName === 'profile') ? 'flex' : 'none';
    document.getElementById('viewAdmin').style.display = (viewName === 'admin') ? 'flex' : 'none';

    const bottomNavEl = document.getElementById('bottomNav').closest('.bottom-nav-wrapper');
    if (viewName === 'profile' || viewName === 'admin') {
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

window.toggleToolsDrawer = function() {
    const wrap = document.getElementById('toolsDrawerWrap');
    if (wrap) wrap.classList.toggle('open');
};

function showStatusBubbleToast(msg) {
    const toast = document.getElementById('statusBubbleToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
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
    if (dropdown) dropdown.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
};

window.handleAuthClick = async function(event) {
    event.stopPropagation();
    if (currentView === 'profile' || currentView === 'admin') return;

    if (window.currentUser) {
        const dropdown = document.getElementById('userDropdownMenu');
        const backdrop = document.getElementById('menuBackdrop');
        const isOpen = dropdown.classList.contains('open');
        
        if (isOpen) {
            dropdown.classList.remove('open');
            backdrop.classList.remove('open');
        } else {
            const authContainer = document.getElementById('headerAuthContainer');
            const rect = authContainer.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 8) + 'px';
            dropdown.style.left = rect.left + 'px';
            dropdown.classList.add('open');
            backdrop.classList.add('open');
        }
    } else {
        if (window.triggerGoogleSignIn) {
            window.triggerGoogleSignIn();
        }
    }
};

window.openMonthlySummaryModal = function(mk) {
    const mShifts = window.shifts.filter(s => s.date && s.date.startsWith(mk));
    let totWorkMins = 0;
    let totPremMins = 0;
    let totNaltMins = 0;

    mShifts.forEach(s => {
         if(s.startTime && s.endTime) {
             totWorkMins += calculateDurationMinutes(s.startTime, s.endTime);
         }
         if(s.premStartTime && s.premEndTime) {
             totPremMins += calculateDurationMinutes(s.premStartTime, s.premEndTime);
         }
         totNaltMins += (Number(s.naltStartMinutes)||0) + (Number(s.naltEndMinutes)||0);
    });

    document.getElementById('summaryModalTitle').textContent = 'סיכום חודשי - ' + formatMonthName(mk);
    document.getElementById('modalWorkVal').textContent = formatMinutesToHM(totWorkMins);
    document.getElementById('modalPremVal').textContent = formatMinutesToHM(totPremMins);
    document.getElementById('modalNaltVal').textContent = formatMinutesToHM(totNaltMins);
    document.getElementById('modalExportBtn').setAttribute('onclick', 'printMonthReport(\'' + mk + '\')');

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

// מחזירים את העיצוב המקורי של הפאנל הנרחב (כולל הטאגים הנקיים, אייקוני הבוקר/צהריים/לילה והעיצוב המקורי)
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

    const { primary: siddurPrimary, secondary: siddurSecondary } = parseSiddurDisplay(shift.siddur);

    let secFontSize = '0.78rem';
    if (siddurSecondary.length > 24) {
        secFontSize = '0.62rem';
    } else if (siddurSecondary.length > 15) {
        secFontSize = '0.70rem';
    }

    const premDurationMins = (shift.premStartTime && shift.premEndTime) ? calculateDurationMinutes(shift.premStartTime, shift.premEndTime) : 0;

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
                            ' + (hasStart && hasEnd ? '<span class="tag tag-complete">סגור</span>' : '<span class="tag tag-alert">חסר</span>') + '\
                            ' + (isOverlap ? '<span class="tag tag-overlap">כפילות</span>' : '') + '\
                        </div>\
                    </div>\
                </div>\
            </div>\
            \
            <div class="shift-details" id="details_' + shiftIdStr + '">\
                <div>\
                    <div class="details-inner">\
                        ' + (isOverlap ? '<div class="sub-breakdown" style="border-color: rgba(234, 179, 8, 0.3);"><div class="breakdown-item" style="color: var(--accent-yellow);">שים לב: קיימת חפיפת שעות</div></div>' : '') + '\
                        <div class="sub-breakdown">\
                            ' + (hasSiddur ? '<div class="breakdown-item-siddur"><span class="breakdown-label">סידור:</span><span class="breakdown-value-center">' + shift.siddur + '</span><div></div></div>' : '') + '\
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
                        ' + (hasNalt ? '\
                        <div class="sub-breakdown">\
                            ' + (naltStart > 0 ? '<div class="breakdown-item"><span class="breakdown-label">נל״ת הלוך (' + formatMinutesToHM(naltStart) + '):</span><span class="breakdown-value" dir="ltr">' + naltStartRange + '</span></div>' : '') + '\
                            ' + (naltEnd > 0 ? '<div class="breakdown-item"><span class="breakdown-label">נל״ת חזור (' + formatMinutesToHM(naltEnd) + '):</span><span class="breakdown-value" dir="ltr">' + naltEndRange + '</span></div>' : '') + '\
                        </div>' : '') + '\
                        ' + (hasPrem ? '\
                        <div class="sub-breakdown">\
                            <div class="breakdown-item">\
                                <span class="breakdown-label">פרמיה ' + (premDurationMins > 0 ? '(' + formatMinutesToHM(premDurationMins) + ')' : '') + ':</span>\
                                <span class="breakdown-value">' + (shift.premStartTime || '---') + ' – ' + (shift.premEndTime || '---') + '</span>\
                            </div>\
                        </div>' : '') + '\
                        ' + (hasNotes ? '<div class="notes-display-box"><span>' + shift.notes + '</span></div>' : '') + '\
                        <div class="card-actions-bar">\
                            <button class="btn-secondary" onclick="event.stopPropagation(); openShiftModal(\'' + shiftIdStr + '\')">עריכה</button>\
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

setupGlobalInteractions();
window.navigateTo(currentView, false);
