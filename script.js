
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* =====================================================
   1. FIREBASE
===================================================== */

// Оставь здесь свои прежние Firebase-ключи.
// projectId уже указан для твоего проекта.

const firebaseConfig = {
  apiKey: "AIzaSyB9WVKkU1fRC7DfdWK58ok8CVAOILINM6o",
  authDomain: "lunch-randomizer-40a83.firebaseapp.com",
  projectId: "lunch-randomizer-40a83",
  storageBucket: "lunch-randomizer-40a83.firebasestorage.app",
  messagingSenderId: "61702529285",
  appId: "1:61702529285:web:ca7ba0af6cf4e9572c576c",
  measurementId: "G-27CZ1FHCZL"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const employeesRef = doc(db, "lunchData", "employees");
const schedulesRef = doc(db, "lunchData", "schedules");

/* =====================================================
   2. НАСТРОЙКИ
===================================================== */

const GROUP_COUNT = 3;
const MAX_GROUP_SIZE = 6;

const GROUP_TIMES = [
    "11:00 — 12:00",
    "12:00 — 13:00",
    "13:00 — 14:00"
];

const DEFAULT_EMPLOYEES = [
    { id: "bayel", name: "Байэль", gender: "male" },
    { id: "aizat", name: "Айзат", gender: "male" },
    { id: "tununuk", name: "Тунунук", gender: "male" },
    { id: "ramazan", name: "Рамазан", gender: "male" },
    { id: "sanzhar", name: "Санжар", gender: "male" },
    { id: "kursant", name: "Курсант", gender: "male", fixed: true },
    { id: "khan", name: "Хан", gender: "male" },

    { id: "asya", name: "Ася", gender: "female" },
    { id: "aiperi", name: "Айпери", gender: "female" },
    { id: "nargiz", name: "Наргиз", gender: "female" },
    { id: "aidana", name: "Айдана", gender: "female" },
    { id: "aidai", name: "Айдай", gender: "female" },
    { id: "arina", name: "Арина", gender: "female" },
    { id: "elnura", name: "Эльнура", gender: "female" },
    { id: "malika", name: "Малика", gender: "female" },
    { id: "elzira", name: "Эльзира", gender: "female" },
    { id: "aigul", name: "Айгуль", gender: "female" }
];

const STORAGE_EMPLOYEES = "lunch_employees_v3";
const STORAGE_SCHEDULES = "lunch_schedules_v3";
const STORAGE_HISTORY = "lunch_history";
const STORAGE_LAST_DATE = "lunch_last_date";

/* =====================================================
   3. DOM
===================================================== */

const scheduleElement = document.getElementById("schedule");
const currentDateElement = document.getElementById("currentDate");

const generateButton = document.getElementById("generateButton");
const settingsButton = document.getElementById("settingsButton");

const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");

const employeeList = document.getElementById("employeeList");
const employeeNameInput = document.getElementById("employeeName");
const employeeGenderSelect = document.getElementById("employeeGender");
const addEmployeeButton = document.getElementById("addEmployeeButton");

const showHistoryButton = document.getElementById("showHistoryButton");
const historyModal = document.getElementById("historyModal");
const closeHistory = document.getElementById("closeHistory");
const historyList = document.getElementById("historyList");

/* =====================================================
   4. СОСТОЯНИЕ ПРИЛОЖЕНИЯ
===================================================== */

let employees = [];
let schedules = [];
let history = [];

let draggedEmployeeId = null;
let selectedEmployee = null;

let isUpdatingFromCloud = false;

/* =====================================================
   5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
===================================================== */

function today() {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
    if (!dateString) return "";

    const [year, month, day] = dateString.split("-");

    return `${day}.${month}.${year}`;
}

function createId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function shuffle(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}

function isGulnaz(employee) {
    if (!employee) return false;

    return (
        employee.id === "gulnaz" ||
        String(employee.name || "").trim().toLowerCase() === "гулназ"
    );
}

function cleanEmployees(list) {
    if (!Array.isArray(list)) return [];

    const unique = new Map();

    list.forEach(employee => {
        if (!employee || !employee.name || isGulnaz(employee)) return;

        const id = employee.id || createId();

        unique.set(id, {
            id,
            name: String(employee.name).trim(),
            gender: employee.gender === "male" ? "male" : "female",
            fixed: id === "kursant" || employee.fixed === true
        });
    });

    return [...unique.values()];
}

function getEmployeeById(id) {
    return employees.find(employee => employee.id === id);
}

function getEmployeeIds(schedule) {
    if (!schedule || !Array.isArray(schedule.groups)) return [];

    return schedule.groups.flatMap(group =>
        (group.people || []).map(person =>
            typeof person === "string" ? person : person.id
        )
    );
}

function normalizeSchedule(schedule) {
    if (!schedule || !Array.isArray(schedule.groups)) return null;

    const groups = schedule.groups.map((group, index) => ({
        time: GROUP_TIMES[index],
        people: (group.people || [])
            .map(person => {
                const id = typeof person === "string" ? person : person.id;
                return employees.find(employee => employee.id === id);
            })
            .filter(Boolean)
            .filter(person => !isGulnaz(person))
            .map(person => person.id)
    }));

    while (groups.length < GROUP_COUNT) {
        groups.push({
            time: GROUP_TIMES[groups.length],
            people: []
        });
    }

    return {
        date: schedule.date || today(),
        groups: groups.slice(0, GROUP_COUNT)
    };
}

function saveLocalData() {
    localStorage.setItem(STORAGE_EMPLOYEES, JSON.stringify(employees));
    localStorage.setItem(STORAGE_SCHEDULES, JSON.stringify(schedules));
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history));
}

function loadLocalData() {
    try {
        employees = cleanEmployees(
            JSON.parse(localStorage.getItem(STORAGE_EMPLOYEES)) || []
        );

        schedules = JSON.parse(
            localStorage.getItem(STORAGE_SCHEDULES)
        ) || [];

        history = JSON.parse(
            localStorage.getItem(STORAGE_HISTORY)
        ) || [];

        schedules = schedules
            .map(normalizeSchedule)
            .filter(Boolean);

        history = history
            .map(normalizeSchedule)
            .filter(Boolean);

    } catch (error) {
        console.error("Ошибка чтения локальных данных:", error);

        employees = [];
        schedules = [];
        history = [];
    }
}

/* =====================================================
   6. FIREBASE: ЗАГРУЗКА И СОХРАНЕНИЕ
===================================================== */

async function saveEmployeesToCloud() {
    try {
        await setDoc(employeesRef, {
            items: employees,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Ошибка сохранения сотрудников:", error);
    }
}

async function saveSchedulesToCloud() {
    try {
        await setDoc(schedulesRef, {
            items: schedules,
            history,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Ошибка сохранения расписания:", error);
    }
}

async function loadInitialCloudData() {
    try {
        const employeesSnapshot = await getDoc(employeesRef);
        const schedulesSnapshot = await getDoc(schedulesRef);

        if (employeesSnapshot.exists()) {
            const cloudEmployees = employeesSnapshot.data().items || [];

            employees = cleanEmployees(cloudEmployees);
        } else if (employees.length === 0) {
            employees = [...DEFAULT_EMPLOYEES];
        }

        if (schedulesSnapshot.exists()) {
            const data = schedulesSnapshot.data();

            schedules = (data.items || [])
                .map(normalizeSchedule)
                .filter(Boolean);

            history = (data.history || [])
                .map(normalizeSchedule)
                .filter(Boolean);
        }

        saveLocalData();

        // Записываем очищенный список обратно в Firebase.
        await saveEmployeesToCloud();
        await saveSchedulesToCloud();

        renderEmployees();
        checkDailySchedule();

    } catch (error) {
        console.error("Firebase недоступен:", error);

        if (employees.length === 0) {
            employees = [...DEFAULT_EMPLOYEES];
        }

        renderEmployees();
        checkDailySchedule();
    }
}

/* =====================================================
   7. РАСПРЕДЕЛЕНИЕ СОТРУДНИКОВ
===================================================== */

function getGroupSizes(total) {
    const base = Math.floor(total / GROUP_COUNT);
    const remainder = total % GROUP_COUNT;

    return Array.from({ length: GROUP_COUNT }, (_, index) =>
        base + (index < remainder ? 1 : 0)
    );
}

function createInitialSchedule() {
    if (employees.length < GROUP_COUNT) {
        return null;
    }

    const sizes = getGroupSizes(employees.length);

    if (sizes.some(size => size > MAX_GROUP_SIZE)) {
        alert("Для расписания нужно не более 18 сотрудников.");
        return null;
    }

    const kursant = employees.find(employee => employee.id === "kursant");

    const ordinaryEmployees = shuffle(
        employees.filter(employee => employee.id !== "kursant")
    );

    const groups = [
        { time: GROUP_TIMES[0], people: [] },
        { time: GROUP_TIMES[1], people: [] },
        { time: GROUP_TIMES[2], people: [] }
    ];

    // Курсант всегда находится в третьей группе.
    if (kursant) {
        groups[2].people.push(kursant.id);
    }

    let remaining = [...ordinaryEmployees];

    // Сначала стараемся распределить мужчин равномерно.
    for (let groupIndex = 0; groupIndex < GROUP_COUNT; groupIndex++) {
        const requiredMen = Math.min(
            2,
            sizes[groupIndex] - groups[groupIndex].people.length
        );

        for (let i = 0; i < requiredMen; i++) {
            const maleIndex = remaining.findIndex(
                employee => employee.gender === "male"
            );

            if (maleIndex === -1) break;

            const [male] = remaining.splice(maleIndex, 1);

            groups[groupIndex].people.push(male.id);
        }
    }

    // Заполняем оставшиеся места.
    for (let groupIndex = 0; groupIndex < GROUP_COUNT; groupIndex++) {
        while (groups[groupIndex].people.length < sizes[groupIndex]) {
            if (remaining.length === 0) break;

            groups[groupIndex].people.push(remaining.shift().id);
        }
    }

    if (remaining.length > 0) {
        return null;
    }

    return {
        date: today(),
        groups
    };
}

/* =====================================================
   8. ПРОВЕРКА И РОТАЦИЯ ПО ДНЯМ
===================================================== */

function scheduleMatchesEmployees(schedule) {
    if (!schedule) return false;

    const ids = getEmployeeIds(schedule);
    const currentIds = employees.map(employee => employee.id);

    if (ids.length !== employees.length) return false;

    if (new Set(ids).size !== ids.length) return false;

    return currentIds.every(id => ids.includes(id));
}

function rotateSchedule(previousSchedule) {
    if (!previousSchedule || employees.length < GROUP_COUNT) {
        return createInitialSchedule();
    }

    const previousGroups = previousSchedule.groups || [];

    const previousIds = new Set(getEmployeeIds(previousSchedule));

    const currentIds = new Set(employees.map(employee => employee.id));

    const allPreviousEmployeesPresent = [...currentIds].every(id =>
        previousIds.has(id)
    );

    if (!allPreviousEmployeesPresent || previousIds.size !== employees.length) {
        return createInitialSchedule();
    }

    const sizes = getGroupSizes(employees.length);

    const newGroups = [
        { time: GROUP_TIMES[0], people: [...(previousGroups[1]?.people || [])] },
        { time: GROUP_TIMES[1], people: [...(previousGroups[2]?.people || [])] },
        { time: GROUP_TIMES[2], people: [...(previousGroups[0]?.people || [])] }
    ];

    // Удаляем возможные дубликаты.
    newGroups.forEach(group => {
        group.people = [...new Set(group.people)]
            .filter(id => currentIds.has(id));
    });

    // Курсант закреплён в третьей группе.
    newGroups.forEach(group => {
        group.people = group.people.filter(id => id !== "kursant");
    });

    const kursant = employees.find(employee => employee.id === "kursant");

    if (kursant) {
        newGroups[2].people.push(kursant.id);
    }

    // Балансируем размеры групп, перемещая сотрудников.
    for (let targetIndex = 0; targetIndex < GROUP_COUNT; targetIndex++) {
        while (newGroups[targetIndex].people.length > sizes[targetIndex]) {
            let sourceIndex = GROUP_COUNT - 1;

            while (
                sourceIndex >= 0 &&
                (
                    sourceIndex === targetIndex ||
                    newGroups[sourceIndex].people.length <= sizes[sourceIndex] ||
                    newGroups[sourceIndex].people.includes("kursant") &&
                    sourceIndex === 2 &&
                    newGroups[sourceIndex].people.length === 1
                )
            ) {
                sourceIndex--;
            }

            if (sourceIndex < 0) break;

            const movableIndex = newGroups[sourceIndex].people.findIndex(
                id => id !== "kursant"
            );

            if (movableIndex === -1) break;

            const [movedId] = newGroups[sourceIndex].people.splice(
                movableIndex,
                1
            );

            newGroups[targetIndex].people.push(movedId);
        }
    }

    for (let targetIndex = 0; targetIndex < GROUP_COUNT; targetIndex++) {
        while (newGroups[targetIndex].people.length < sizes[targetIndex]) {
            const sourceIndex = newGroups.findIndex((group, index) =>
                index !== targetIndex &&
                group.people.length > sizes[index]
            );

            if (sourceIndex === -1) break;

            const movableIndex = newGroups[sourceIndex].people.findIndex(
                id => id !== "kursant"
            );

            if (movableIndex === -1) break;

            const [movedId] = newGroups[sourceIndex].people.splice(
                movableIndex,
                1
            );

            newGroups[targetIndex].people.push(movedId);
        }
    }

    const result = {
        date: today(),
        groups: newGroups
    };

    const allIds = result.groups.flatMap(group => group.people);

    const valid =
        allIds.length === employees.length &&
        new Set(allIds).size === employees.length &&
        employees.every(employee => allIds.includes(employee.id)) &&
        result.groups.every((group, index) =>
            group.people.length === sizes[index]
        );

    return valid ? result : createInitialSchedule();
}

function checkDailySchedule() {
    const currentDate = today();

    let currentSchedule = schedules.find(
        schedule => schedule.date === currentDate
    );

    if (currentSchedule && scheduleMatchesEmployees(currentSchedule)) {
        renderSchedule(currentSchedule);
        updateDate();
        return;
    }

    const previousSchedule = [...schedules]
        .filter(schedule => schedule.date < currentDate)
        .sort((a, b) => b.date.localeCompare(a.date))[0];

    if (currentSchedule) {
        schedules = schedules.filter(
            schedule => schedule.date !== currentDate
        );
    }

    if (previousSchedule) {
        history.unshift(previousSchedule);
    }

    const newSchedule = previousSchedule
        ? rotateSchedule(previousSchedule)
        : createInitialSchedule();

    if (!newSchedule) {
        renderEmptySchedule();
        return;
    }

    schedules = schedules.filter(
        schedule => schedule.date !== currentDate
    );

    schedules.push(newSchedule);

    saveLocalData();
    saveSchedulesToCloud();

    renderSchedule(newSchedule);
    updateDate();
}

/* =====================================================
   9. ОТОБРАЖЕНИЕ РАСПИСАНИЯ
===================================================== */

function renderEmptySchedule() {
    if (!scheduleElement) return;

    scheduleElement.innerHTML = `
        <div class="empty-schedule">
            <p>Недостаточно сотрудников для формирования расписания.</p>
            <p>Добавьте минимум 3 сотрудников.</p>
        </div>
    `;
}

function renderSchedule(schedule) {
    if (!scheduleElement) return;

    scheduleElement.innerHTML = "";

    schedule.groups.forEach((group, groupIndex) => {
        const groupElement = document.createElement("div");

        groupElement.className = "lunch-group";
        groupElement.dataset.group = groupIndex;

        const title = document.createElement("div");
        title.className = "group-header";

        title.innerHTML = `
            <div class="group-number">0${groupIndex + 1}</div>
            <div class="group-info">
                <h3>${GROUP_TIMES[groupIndex]}</h3>
                <span>${group.people.length} сотрудников</span>
            </div>
        `;

        const peopleContainer = document.createElement("div");
        peopleContainer.className = "group-people";
        peopleContainer.dataset.group = groupIndex;

        peopleContainer.addEventListener("dragover", event => {
            event.preventDefault();
            peopleContainer.classList.add("drag-over");
        });

        peopleContainer.addEventListener("dragleave", () => {
            peopleContainer.classList.remove("drag-over");
        });

        peopleContainer.addEventListener("drop", event => {
            event.preventDefault();
            peopleContainer.classList.remove("drag-over");

            const targetGroup = Number(peopleContainer.dataset.group);

            if (draggedEmployeeId) {
                moveEmployee(draggedEmployeeId, targetGroup);
                draggedEmployeeId = null;
            }
        });

        group.people.forEach(employeeId => {
            const employee = getEmployeeById(employeeId);

            if (!employee) return;

            const personElement = document.createElement("div");

            personElement.className = "employee-card";
            personElement.draggable = employee.id !== "kursant";
            personElement.dataset.employeeId = employee.id;

            personElement.innerHTML = `
                <span class="employee-dot ${employee.gender}"></span>
                <span class="employee-card-name"></span>
                ${employee.id === "kursant"
                    ? '<span class="fixed-label">FIX</span>'
                    : ""}
            `;

            personElement.querySelector(".employee-card-name").textContent =
                employee.name;

            personElement.addEventListener("dragstart", () => {
                draggedEmployeeId = employee.id;
            });

            personElement.addEventListener("dragend", () => {
                draggedEmployeeId = null;
            });

            personElement.addEventListener("click", () => {
                handleEmployeeClick(employee.id);
            });

            peopleContainer.appendChild(personElement);
        });

        groupElement.appendChild(title);
        groupElement.appendChild(peopleContainer);

        scheduleElement.appendChild(groupElement);
    });
}

function updateDate() {
    if (!currentDateElement) return;

    currentDateElement.textContent = formatDate(today());
}

/* =====================================================
   10. ПЕРЕНОС СОТРУДНИКОВ МЕЖДУ ГРУППАМИ
===================================================== */

function handleEmployeeClick(employeeId) {
    if (employeeId === "kursant") return;

    if (!selectedEmployee) {
        selectedEmployee = employeeId;

        document.querySelectorAll(".employee-card").forEach(card => {
            card.classList.toggle(
                "selected",
                card.dataset.employeeId === employeeId
            );
        });

        return;
    }

    if (selectedEmployee === employeeId) {
        selectedEmployee = null;
        renderCurrentSchedule();
        return;
    }

    const first = selectedEmployee;
    const second = employeeId;

    selectedEmployee = null;

    swapEmployees(first, second);
}

function moveEmployee(employeeId, targetGroupIndex) {
    const schedule = getCurrentSchedule();

    if (!schedule || employeeId === "kursant") return;

    const sourceGroupIndex = schedule.groups.findIndex(group =>
        group.people.includes(employeeId)
    );

    if (sourceGroupIndex === -1 || sourceGroupIndex === targetGroupIndex) {
        return;
    }

    const targetGroup = schedule.groups[targetGroupIndex];

    if (targetGroup.people.length >= MAX_GROUP_SIZE) {
        alert("В этой группе уже 6 сотрудников.");
        return;
    }

    schedule.groups[sourceGroupIndex].people =
        schedule.groups[sourceGroupIndex].people.filter(
            id => id !== employeeId
        );

    targetGroup.people.push(employeeId);

    saveCurrentSchedule(schedule);
}

function swapEmployees(firstId, secondId) {
    const schedule = getCurrentSchedule();

    if (!schedule) return;

    if (firstId === "kursant" || secondId === "kursant") {
        renderCurrentSchedule();
        return;
    }

    const firstGroupIndex = schedule.groups.findIndex(group =>
        group.people.includes(firstId)
    );

    const secondGroupIndex = schedule.groups.findIndex(group =>
        group.people.includes(secondId)
    );

    if (firstGroupIndex === -1 || secondGroupIndex === -1) return;

    if (firstGroupIndex === secondGroupIndex) {
        renderCurrentSchedule();
        return;
    }

    const firstPeople = schedule.groups[firstGroupIndex].people;
    const secondPeople = schedule.groups[secondGroupIndex].people;

    firstPeople[firstPeople.indexOf(firstId)] = secondId;
    secondPeople[secondPeople.indexOf(secondId)] = firstId;

    saveCurrentSchedule(schedule);
}

function getCurrentSchedule() {
    return schedules.find(schedule => schedule.date === today());
}

function renderCurrentSchedule() {
    const schedule = getCurrentSchedule();

    if (schedule) {
        renderSchedule(schedule);
    }
}

function saveCurrentSchedule(schedule) {
    schedules = schedules.map(item =>
        item.date === schedule.date ? schedule : item
    );

    saveLocalData();
    saveSchedulesToCloud();

    renderSchedule(schedule);
}

/* =====================================================
   11. РУЧНАЯ ГЕНЕРАЦИЯ
===================================================== */

function generateNewSchedule() {
    if (employees.length < GROUP_COUNT) {
        alert("Для расписания нужно минимум 3 сотрудника.");
        return;
    }

    const newSchedule = createInitialSchedule();

    if (!newSchedule) {
        alert("Не удалось сформировать расписание. Проверьте список сотрудников.");
        return;
    }

    const oldSchedule = getCurrentSchedule();

    if (oldSchedule) {
        history.unshift({
            date: oldSchedule.date,
            groups: oldSchedule.groups.map(group => ({
                time: group.time,
                people: [...group.people]
            }))
        });
    }

    schedules = schedules.filter(
        schedule => schedule.date !== today()
    );

    schedules.push(newSchedule);

    selectedEmployee = null;

    saveLocalData();
    saveSchedulesToCloud();

    renderSchedule(newSchedule);
    renderHistory();
}

/* =====================================================
   12. СОТРУДНИКИ: ОТОБРАЖЕНИЕ
===================================================== */

function renderEmployees() {
    if (!employeeList) return;

    employeeList.innerHTML = "";

    employees.forEach(employee => {
        const item = document.createElement("div");

        item.className = "employee-setting-item";

        item.innerHTML = `
            <div class="employee-setting-info">
                <span class="employee-dot ${employee.gender}"></span>
                <span class="employee-setting-name"></span>
            </div>
            <button
                class="delete-employee"
                type="button"
                aria-label="Удалить сотрудника"
                ${employee.id === "kursant" ? "disabled" : ""}
            >
                ×
            </button>
        `;

        item.querySelector(".employee-setting-name").textContent =
            employee.name;

        const deleteButton = item.querySelector(".delete-employee");

        deleteButton.addEventListener("click", () => {
            deleteEmployee(employee.id);
        });

        employeeList.appendChild(item);
    });
}

/* =====================================================
   13. ДОБАВЛЕНИЕ СОТРУДНИКА
===================================================== */

async function addEmployee() {
    const name = employeeNameInput?.value.trim();
    const gender = employeeGenderSelect?.value;

    if (!name) {
        alert("Введите имя сотрудника.");
        return;
    }

    if (employees.some(employee =>
        employee.name.toLowerCase() === name.toLowerCase()
    )) {
        alert("Такой сотрудник уже существует.");
        return;
    }

    const employee = {
        id: createId(),
        name,
        gender: gender === "male" ? "male" : "female",
        fixed: false
    };

    employees.push(employee);

    employeeNameInput.value = "";

    saveLocalData();
    await saveEmployeesToCloud();

    renderEmployees();

    const newSchedule = createInitialSchedule();

    if (newSchedule) {
        schedules = schedules.filter(
            schedule => schedule.date !== today()
        );

        schedules.push(newSchedule);

        saveLocalData();
        await saveSchedulesToCloud();

        renderSchedule(newSchedule);
    } else {
        renderEmptySchedule();
    }
}

/* =====================================================
   14. УДАЛЕНИЕ СОТРУДНИКА
===================================================== */

async function deleteEmployee(employeeId) {
    if (employeeId === "kursant") {
        alert("Курсант закреплён за третьей группой и не может быть удалён.");
        return;
    }

    const employee = getEmployeeById(employeeId);

    if (!employee) return;

    const confirmed = confirm(
        `Удалить сотрудника «${employee.name}»?`
    );

    if (!confirmed) return;

    employees = employees.filter(
        person => person.id !== employeeId
    );

    // Удаляем сотрудника из всех сохранённых расписаний.
    schedules = schedules.map(schedule => ({
        ...schedule,
        groups: schedule.groups.map(group => ({
            ...group,
            people: group.people.filter(id => id !== employeeId)
        }))
    }));

    history = history.map(schedule => ({
        ...schedule,
        groups: schedule.groups.map(group => ({
            ...group,
            people: group.people.filter(id => id !== employeeId)
        }))
    }));

    selectedEmployee = null;

    saveLocalData();

    await saveEmployeesToCloud();
    await saveSchedulesToCloud();

    renderEmployees();

    if (employees.length >= GROUP_COUNT) {
        const newSchedule = createInitialSchedule();

        if (newSchedule) {
            schedules = schedules.filter(
                schedule => schedule.date !== today()
            );

            schedules.push(newSchedule);

            saveLocalData();
            await saveSchedulesToCloud();

            renderSchedule(newSchedule);
        } else {
            renderEmptySchedule();
        }
    } else {
        schedules = schedules.filter(
            schedule => schedule.date !== today()
        );

        await saveSchedulesToCloud();
        renderEmptySchedule();
    }
}

/* =====================================================
   15. ИСТОРИЯ
===================================================== */

function renderHistory() {
    if (!historyList) return;

    historyList.innerHTML = "";

    if (history.length === 0) {
        historyList.innerHTML = `
            <div class="empty-history">
                История пока пуста.
            </div>
        `;

        return;
    }

    history.forEach(schedule => {
        const historyItem = document.createElement("div");

        historyItem.className = "history-item";

        const heading = document.createElement("h3");
        heading.textContent = formatDate(schedule.date);

        historyItem.appendChild(heading);

        schedule.groups.forEach((group, index) => {
            const groupElement = document.createElement("div");

            groupElement.className = "history-group";

            const title = document.createElement("strong");
            title.textContent = GROUP_TIMES[index];

            const names = document.createElement("p");

            names.textContent = group.people
                .map(id => getEmployeeById(id)?.name)
                .filter(Boolean)
                .join(", ");

            groupElement.appendChild(title);
            groupElement.appendChild(names);

            historyItem.appendChild(groupElement);
        });

        historyList.appendChild(historyItem);
    });
}

/* =====================================================
   16. МОДАЛЬНЫЕ ОКНА
===================================================== */

function openModal(modal) {
    if (!modal) return;

    modal.classList.add("active");
}

function closeModal(modal) {
    if (!modal) return;

    modal.classList.remove("active");
}

settingsButton?.addEventListener("click", () => {
    renderEmployees();
    openModal(settingsModal);
});

closeSettings?.addEventListener("click", () => {
    closeModal(settingsModal);
});

showHistoryButton?.addEventListener("click", () => {
    renderHistory();
    openModal(historyModal);
});

closeHistory?.addEventListener("click", () => {
    closeModal(historyModal);
});

[settingsModal, historyModal].forEach(modal => {
    modal?.addEventListener("click", event => {
        if (event.target === modal) {
            closeModal(modal);
        }
    });
});

/* =====================================================
   17. ОБРАБОТЧИКИ КНОПОК
===================================================== */

generateButton?.addEventListener("click", generateNewSchedule);

addEmployeeButton?.addEventListener("click", addEmployee);

employeeNameInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        addEmployee();
    }
});

/* =====================================================
   18. СИНХРОНИЗАЦИЯ FIREBASE В РЕАЛЬНОМ ВРЕМЕНИ
===================================================== */

onSnapshot(employeesRef, snapshot => {
    if (!snapshot.exists() || isUpdatingFromCloud) return;

    const cloudEmployees = cleanEmployees(
        snapshot.data().items || []
    );

    const currentIds = employees.map(employee => employee.id).sort();
    const cloudIds = cloudEmployees.map(employee => employee.id).sort();

    if (JSON.stringify(currentIds) === JSON.stringify(cloudIds)) return;

    employees = cloudEmployees;

    saveLocalData();
    renderEmployees();

    const currentSchedule = getCurrentSchedule();

    if (currentSchedule && !scheduleMatchesEmployees(currentSchedule)) {
        const newSchedule = createInitialSchedule();

        if (newSchedule) {
            schedules = schedules.filter(
                schedule => schedule.date !== today()
            );

            schedules.push(newSchedule);

            saveLocalData();
            saveSchedulesToCloud();

            renderSchedule(newSchedule);
        } else {
            renderEmptySchedule();
        }
    }
});

/* =====================================================
   19. ЗАПУСК ПРИЛОЖЕНИЯ
===================================================== */

async function init() {
    loadLocalData();

    if (employees.length === 0) {
        employees = [...DEFAULT_EMPLOYEES];
    }

    renderEmployees();
    updateDate();

    await loadInitialCloudData();
}

init();
