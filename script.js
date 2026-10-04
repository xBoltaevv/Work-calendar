(() => {
    'use strict';

    const USERS_KEY = 'users';
    const SESSION_KEY = 'loggedInUser';
    const WORK_PREFIX = 'workData:';
    const DEFAULT_PREFIX = 'defaultWorkInfo:';

    const getUsers = () => {
        try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
        catch { return []; }
    };

    const saveUsers = users => localStorage.setItem(USERS_KEY, JSON.stringify(users));
    const normalizeEmail = email => email.trim().toLowerCase();
    const userKey = email => encodeURIComponent(normalizeEmail(email));
    const workKey = email => `${WORK_PREFIX}${userKey(email)}`;
    const defaultKey = email => `${DEFAULT_PREFIX}${userKey(email)}`;

    function loadJSON(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
        catch { return fallback; }
    }

    function saveJSON(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function showMessage(element, message = '') {
        if (element) element.textContent = message;
    }

    // ---------------- AUTH ----------------
    const signupForm = document.getElementById('signupForm');
    const loginForm = document.getElementById('loginForm');

    if (signupForm) {
        signupForm.addEventListener('submit', event => {
            event.preventDefault();

            const email = normalizeEmail(document.getElementById('email').value);
            const pass = document.getElementById('password').value;
            const repeatPass = document.getElementById('repeat-password').value;
            const message = document.getElementById('formMessage');

            if (!email || !pass || !repeatPass) {
                showMessage(message, 'Please fill in all fields.');
                return;
            }
            if (pass.length < 6) {
                showMessage(message, 'Password must be at least 6 characters.');
                return;
            }
            if (pass !== repeatPass) {
                showMessage(message, 'Passwords do not match.');
                return;
            }

            const users = getUsers();
            if (users.some(user => normalizeEmail(user.email) === email)) {
                showMessage(message, 'This email is already registered.');
                return;
            }

            users.push({ email, pass });
            saveUsers(users);
            localStorage.setItem(SESSION_KEY, email);
            window.location.href = 'main.html';
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', event => {
            event.preventDefault();

            const email = normalizeEmail(document.getElementById('email').value);
            const pass = document.getElementById('password').value;
            const message = document.getElementById('formMessage');
            const user = getUsers().find(u => normalizeEmail(u.email) === email && u.pass === pass);

            if (!user) {
                showMessage(message, 'Invalid email or password.');
                return;
            }

            localStorage.setItem(SESSION_KEY, email);
            window.location.href = 'main.html';
        });
    }

    // ---------------- CALENDAR ----------------
    const calendar = document.getElementById('calendar');
    if (!calendar) return;

    const loggedInUser = localStorage.getItem(SESSION_KEY);
    if (!loggedInUser) {
        window.location.replace('index.html');
        return;
    }

    const currentUser = normalizeEmail(loggedInUser);
    const workData = loadJSON(workKey(currentUser), {});
    let isFullYear = false;
    let selectedDate = null;
    let lastFocusedElement = null;

    const expandBtn = document.getElementById('expandBtn');
    const todayBtn = document.getElementById('todayBtn');
    const popup = document.getElementById('popup');
    const backdrop = document.getElementById('modalBackdrop');
    const popupTitle = document.getElementById('popupTitle');
    const popupMessage = document.getElementById('popupMessage');
    const shiftPreview = document.getElementById('shiftPreview');
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    const hourlyPayInput = document.getElementById('hourlyPay');
    const breakMinutesInput = document.getElementById('breakMinutes');
    const useSameBtn = document.getElementById('useSameBtn');
    const fillPopupDefaultBtn = document.getElementById('fillPopupDefaultBtn');
    const saveBtn = document.getElementById('saveBtn');
    const paidBtn = document.getElementById('paidBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const closeBtn = document.getElementById('closeBtn');
    const defaultStart = document.getElementById('defaultStart');
    const defaultEnd = document.getElementById('defaultEnd');
    const defaultPay = document.getElementById('defaultPay');
    const saveDefaultBtn = document.getElementById('saveDefaultBtn');
    const clearDefaultBtn = document.getElementById('clearDefaultBtn');
    const fillDefaultBtn = document.getElementById('fillDefaultBtn');
    const daysWorkedSpan = document.getElementById('daysWorked');
    const totalHoursSpan = document.getElementById('totalHours');
    const totalEarningsSpan = document.getElementById('totalEarnings');
    const paidEarningsSpan = document.getElementById('paidEarnings');
    const userGreeting = document.getElementById('userGreeting');
    const logoutBtn = document.getElementById('logoutBtn');

    userGreeting.textContent = currentUser;

    function getDateString(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function parseDateString(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function calculateHours(start, end, breakMinutes = 0) {
        if (!start || !end) return 0;
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        let startMinutes = sh * 60 + sm;
        let endMinutes = eh * 60 + em;

        // Treat an end time earlier than the start as an overnight shift.
        if (endMinutes <= startMinutes) endMinutes += 24 * 60;

        const minutes = endMinutes - startMinutes - Math.max(0, Number(breakMinutes) || 0);
        return Math.max(0, minutes / 60);
    }

    function formatMoney(value) {
        return Math.round(value).toLocaleString('ko-KR');
    }

    function getDefaultInfo() {
        return loadJSON(defaultKey(currentUser), null);
    }

    function persistWorkData() {
        saveJSON(workKey(currentUser), workData);
    }

    function updateSummary() {
        let daysWorked = 0;
        let totalHours = 0;
        let unpaidEarnings = 0;
        let paidEarnings = 0;

        Object.values(workData).forEach(data => {
            if (!data || typeof data.hours !== 'number') return;
            daysWorked++;
            totalHours += data.hours;
            const earnings = data.hours * (Number(data.hourlyPay) || 0);
            if (data.paid) paidEarnings += earnings;
            else unpaidEarnings += earnings;
        });

        daysWorkedSpan.textContent = daysWorked;
        totalHoursSpan.textContent = totalHours.toFixed(2);
        totalEarningsSpan.textContent = formatMoney(unpaidEarnings);
        paidEarningsSpan.textContent = formatMoney(paidEarnings);
    }

    function createDayCell(dateStr, dayNumber, today) {
        const data = workData[dateStr];
        const dayDiv = document.createElement('button');
        dayDiv.type = 'button';
        dayDiv.className = 'day';
        dayDiv.setAttribute('aria-label', `${dateStr}${data ? `, ${data.hours.toFixed(2)} hours` : ', no work recorded'}`);

        if (data) {
            dayDiv.classList.add('worked');
            if (data.paid) dayDiv.classList.add('paid');
        }

        if (today === dateStr) dayDiv.classList.add('today');

        const number = document.createElement('span');
        number.className = 'day-number';
        number.textContent = dayNumber;
        dayDiv.appendChild(number);

        if (data) {
            const details = document.createElement('span');
            details.className = 'day-details';
            const paidLabel = data.paid ? ' • Paid' : '';
            details.textContent = `${data.hours.toFixed(2)}h${paidLabel}`;
            dayDiv.appendChild(details);
        }

        dayDiv.addEventListener('click', () => openPopup(dateStr));
        return dayDiv;
    }

    function buildCalendar(singleMonth = true, targetYear = new Date().getFullYear()) {
        calendar.innerHTML = '';
        const today = getDateString(new Date());
        const months = singleMonth ? [new Date().getMonth()] : Array.from({ length: 12 }, (_, i) => i);

        months.forEach(month => {
            const monthStart = new Date(targetYear, month, 1);
            const daysInMonth = new Date(targetYear, month + 1, 0).getDate();
            const monthName = monthStart.toLocaleString(undefined, { month: 'long' });

            const monthTitle = document.createElement('div');
            monthTitle.className = 'month-title';
            monthTitle.textContent = `${monthName} ${targetYear}`;
            calendar.appendChild(monthTitle);

            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
                const dayName = document.createElement('div');
                dayName.className = 'day-name';
                dayName.textContent = day;
                calendar.appendChild(dayName);
            });

            for (let i = 0; i < monthStart.getDay(); i++) {
                const emptyDay = document.createElement('div');
                emptyDay.className = 'day empty';
                emptyDay.setAttribute('aria-hidden', 'true');
                calendar.appendChild(emptyDay);
            }

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${targetYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                calendar.appendChild(createDayCell(dateStr, day, today));
            }
        });

        updateSummary();
    }

    function updatePreview() {
        const hours = calculateHours(startTimeInput.value, endTimeInput.value, breakMinutesInput.value);
        const pay = Number(hourlyPayInput.value) || 0;
        if (!startTimeInput.value || !endTimeInput.value) {
            shiftPreview.textContent = 'Enter your shift details.';
            return;
        }
        const overnight = endTimeInput.value <= startTimeInput.value ? ' • Overnight shift' : '';
        shiftPreview.textContent = `${hours.toFixed(2)} hours • ₩${formatMoney(hours * pay)} estimated${overnight}`;
    }

    function openPopup(dateStr) {
        selectedDate = dateStr;
        lastFocusedElement = document.activeElement;
        const data = workData[dateStr] || {};
        popupTitle.textContent = `Work Day — ${dateStr}`;
        startTimeInput.value = data.startTime || '';
        endTimeInput.value = data.endTime || '';
        hourlyPayInput.value = data.hourlyPay ?? '';
        breakMinutesInput.value = data.breakMinutes ?? 0;
        paidBtn.textContent = data.paid ? 'Mark Unpaid' : 'Mark Paid';
        deleteBtn.disabled = !data;
        showMessage(popupMessage);
        updatePreview();
        backdrop.hidden = false;
        popup.hidden = false;
        startTimeInput.focus();
    }

    function closePopup() {
        popup.hidden = true;
        backdrop.hidden = true;
        selectedDate = null;
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
    }

    function fillFromDefault() {
        const info = getDefaultInfo();
        if (!info) {
            showMessage(popupMessage, 'No default work info saved yet.');
            return;
        }
        startTimeInput.value = info.start;
        endTimeInput.value = info.end;
        hourlyPayInput.value = info.pay;
        breakMinutesInput.value = info.breakMinutes ?? 0;
        updatePreview();
        showMessage(popupMessage);
    }

    expandBtn.addEventListener('click', () => {
        isFullYear = !isFullYear;
        expandBtn.textContent = isFullYear ? 'Show Current Month' : 'Expand to Full Year';
        buildCalendar(!isFullYear);
    });

    todayBtn.addEventListener('click', () => {
        isFullYear = false;
        expandBtn.textContent = 'Expand to Full Year';
        buildCalendar(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    useSameBtn.addEventListener('click', () => {
        if (!selectedDate) return;
        const previousDate = parseDateString(selectedDate);
        previousDate.setDate(previousDate.getDate() - 1);
        const previousData = workData[getDateString(previousDate)];
        if (!previousData) {
            showMessage(popupMessage, 'No work entry exists for the previous day.');
            return;
        }
        startTimeInput.value = previousData.startTime;
        endTimeInput.value = previousData.endTime;
        hourlyPayInput.value = previousData.hourlyPay;
        breakMinutesInput.value = previousData.breakMinutes ?? 0;
        updatePreview();
        showMessage(popupMessage);
    });

    fillPopupDefaultBtn.addEventListener('click', fillFromDefault);
    fillDefaultBtn.addEventListener('click', fillFromDefault);

    saveBtn.addEventListener('click', () => {
        if (!selectedDate) return;
        const start = startTimeInput.value;
        const end = endTimeInput.value;
        const pay = Number(hourlyPayInput.value);
        const breakMinutes = Number(breakMinutesInput.value) || 0;
        const hours = calculateHours(start, end, breakMinutes);

        if (!start || !end || !Number.isFinite(pay) || pay < 0 || hours <= 0) {
            showMessage(popupMessage, 'Please enter valid start/end times and hourly pay.');
            return;
        }

        const existing = workData[selectedDate];
        workData[selectedDate] = {
            startTime: start,
            endTime: end,
            hourlyPay: pay,
            breakMinutes,
            hours,
            paid: existing?.paid || false
        };

        persistWorkData();
        closePopup();
        buildCalendar(!isFullYear);
    });

    paidBtn.addEventListener('click', () => {
        if (!selectedDate || !workData[selectedDate]) {
            showMessage(popupMessage, 'Save the work entry before changing its payment status.');
            return;
        }
        workData[selectedDate].paid = !workData[selectedDate].paid;
        persistWorkData();
        closePopup();
        buildCalendar(!isFullYear);
    });

    deleteBtn.addEventListener('click', () => {
        if (!selectedDate || !workData[selectedDate]) return;
        if (!window.confirm(`Delete the work entry for ${selectedDate}?`)) return;
        delete workData[selectedDate];
        persistWorkData();
        closePopup();
        buildCalendar(!isFullYear);
    });

    closeBtn.addEventListener('click', closePopup);
    backdrop.addEventListener('click', closePopup);

    [startTimeInput, endTimeInput, hourlyPayInput, breakMinutesInput].forEach(input => {
        input.addEventListener('input', updatePreview);
    });

    saveDefaultBtn.addEventListener('click', () => {
        const start = defaultStart.value;
        const end = defaultEnd.value;
        const pay = Number(defaultPay.value);
        if (!start || !end || !Number.isFinite(pay) || pay < 0) {
            alert('Please fill in valid default work information.');
            return;
        }
        saveJSON(defaultKey(currentUser), { start, end, pay, breakMinutes: 0 });
        alert('Default work info saved.');
    });

    clearDefaultBtn.addEventListener('click', () => {
        localStorage.removeItem(defaultKey(currentUser));
        defaultStart.value = '';
        defaultEnd.value = '';
        defaultPay.value = '';
        alert('Default work info cleared.');
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(SESSION_KEY);
        window.location.replace('index.html');
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !popup.hidden) closePopup();
    });

    const defaultInfo = getDefaultInfo();
    if (defaultInfo) {
        defaultStart.value = defaultInfo.start || '';
        defaultEnd.value = defaultInfo.end || '';
        defaultPay.value = defaultInfo.pay ?? '';
    }

    buildCalendar(true);
})();
