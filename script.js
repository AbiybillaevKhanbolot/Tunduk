import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// ==================================================
// FIREBASE
// ==================================================

const firebaseConfig = {
    apiKey: "AIzaSyB9WVKkU1fRC7DfdWK58ok8CVAOILINM6o",
    authDomain: "lunch-randomizer-40a83.firebaseapp.com",
    projectId: "lunch-randomizer-40a83",
    storageBucket: "lunch-randomizer-40a83.firebasestorage.app",
    messagingSenderId: "61702529285",
    appId: "1:61702529285:web:ca7ba0af6cf4e9572c576c",
    measurementId: "G-27CZ1FHCZL"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const EMPLOYEES_DOC = doc(db, "lunchData", "employees");
const SCHEDULES_DOC = doc(db, "lunchData", "schedules");

// ==================================================
// НАСТРОЙКИ
// ==================================================

const TIMES = [
    "11:00–12:00",
    "12:00–13:00",
    "13:00–14:00"
];

const GROUP_SIZE = 6;

const STORAGE_EMPLOYEES = "lunch_employees_v3";
const STORAGE_SCHEDULES = "lunch_schedules_v3";
const STORAGE_OLD_HISTORY = "lunch_history";

const DEFAULT_EMPLOYEES = [
    { id: "bayel", name: "Байэль", gender: "male" },
    { id: "aizat", name: "Айзат", gender: "male" },
    { id: "tunuk", name: "Тунук", gender: "female" },
    { id: "ramazan", name: "Рамазан", gender: "male" },
    { id: "sanjar", name: "Санжар", gender: "male" },
    { id: "kursant", name: "Курсант", gender: "male", fixed: true },
    { id: "khan", name: "Хан", gender: "male" },
    { id: "asya", name: "Ася", gender: "female" },
    { id: "aiperi", name: "Айпери", gender: "female" },
    { id: "nargiz", name: "Наргиз", gender: "female" },
    { id: "aidana", name: "Айдана", gender: "female" },
    { id: "gulnaz", name: "Гулназ", gender: "female" },
    { id: "aidai", name: "Айдай", gender: "female" },
    { id: "arina", name: "Арина", gender: "female" },
    { id: "elnura", name: "Эльнура", gender: "female" },
    { id: "malika", name: "Малика", gender: "female" },
    { id: "elzira", name: "Эльзира", gender: "female" },
    { id: "aigul", name: "Айгуль", gender: "female" }
];

let selectedDate = getDateKey();
let selectedPersonId = null;
let cloudReady = false;
let applyingRemoteData = false;

let employeeWriteQueue = Promise.resolve();
let scheduleWriteQueue = Promise.resolve();

// ==================================================
// ЭЛЕМЕНТЫ HTML
// ==================================================

const loadingScreen = document.getElementById("loadingScreen");
const app = document.getElementById("app");
const scheduleElement = document.getElementById("schedule");
const currentDateElement = document.getElementById("currentDate");
const datePicker = document.getElementById("datePicker");

const previousDayButton = document.getElementById("previousDayButton");
const nextDayButton = document.getElementById("nextDayButton");
const todayButton = document.getElementById("todayButton");
const generateButton = document.getElementById("generateButton");

const settingsButton = document.getElementById("settingsButton");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");
const employeeList = document.getElementById("employeeList");
const employeeName = document.getElementById("employeeName");
const employeeGender = document.getElementById("employeeGender");
const addEmployeeButton = document.getElementById("addEmployeeButton");

const showHistoryButton = document.getElementById("showHistoryButton");
const historyModal = document.getElementById("historyModal");
const closeHistory = document.getElementById("closeHistory");
const historyList = document.getElementById("historyList");

const moveHint = document.getElementById("moveHint");
const cancelMoveButton = document.getElementById("cancelMoveButton");

// ==================================================
// СОТРУДНИКИ И НОРМАЛИЗАЦИЯ
// ==================================================

function normalizeName(name) {
    const original = String(name ?? "").trim();
    const lower = original.toLocaleLowerCase("ru-RU");

    if (lower === "тунук" || lower === "тунунук") {
        return "Тунук";
    }

    return original;
}

function createIdFromName(name) {
    return normalizeName(name)
        .toLocaleLowerCase("ru-RU")
        .replace(/[^a-zа-яё0-9]+/gi, "-")
        .replace(/^-|-$/g, "");
}

function normalizePerson(person, index = 0) {
    const name = normalizeName(person?.name);

    return {
        id: String(
            person?.id ||
            createIdFromName(name) ||
            `employee-${index}`
        ),
        name,
        gender: person?.gender === "male" ? "male" : "female",
        fixed: Boolean(person?.fixed || name === "Курсант")
    };
}

function normalizeSchedule(schedule) {
    if (
        !schedule ||
        typeof schedule.date !== "string" ||
        !Array.isArray(schedule.groups)
    ) {
        return null;
    }

    return {
        date: schedule.date,
        groups: TIMES.map((time, index) => {
            const group = schedule.groups[index];

            return {
                time,
                people: Array.isArray(group?.people)
                    ? group.people.map(normalizePerson)
                    : []
            };
        })
    };
}

// ==================================================
// ЛОКАЛЬНОЕ ХРАНИЛИЩЕ
// ==================================================

function getEmployees() {
    try {
        const raw = localStorage.getItem(STORAGE_EMPLOYEES);

        if (!raw) {
            return DEFAULT_EMPLOYEES.map(normalizePerson);
        }

        const employees = JSON.parse(raw);

        if (!Array.isArray(employees)) {
            throw new Error("Неверный формат списка сотрудников");
        }

        return employees.map(normalizePerson);
    } catch (error) {
        console.error("Ошибка чтения сотрудников:", error);
        return DEFAULT_EMPLOYEES.map(normalizePerson);
    }
}

function saveEmployees(employees) {
    const normalized = employees.map(normalizePerson);

    localStorage.setItem(
        STORAGE_EMPLOYEES,
        JSON.stringify(normalized)
    );

    if (!cloudReady || applyingRemoteData) return;

    employeeWriteQueue = employeeWriteQueue
        .then(() => setDoc(EMPLOYEES_DOC, {
            items: normalized,
            updatedAt: new Date().toISOString()
        }))
        .catch(error => {
            console.error("Ошибка сохранения сотрудников:", error);
        });
}

function getSchedules() {
    try {
        const raw = localStorage.getItem(STORAGE_SCHEDULES);

        if (!raw) return [];

        const schedules = JSON.parse(raw);

        if (!Array.isArray(schedules)) return [];

        return schedules.map(normalizeSchedule).filter(Boolean);
    } catch (error) {
        console.error("Ошибка чтения расписаний:", error);
        return [];
    }
}

function saveSchedules(schedules) {
    const normalized = schedules
        .map(normalizeSchedule)
        .filter(Boolean)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 365);

    localStorage.setItem(
        STORAGE_SCHEDULES,
        JSON.stringify(normalized)
    );

    if (!cloudReady || applyingRemoteData) return;

    scheduleWriteQueue = scheduleWriteQueue
        .then(() => setDoc(SCHEDULES_DOC, {
            items: normalized,
            updatedAt: new Date().toISOString()
        }))
        .catch(error => {
            console.error("Ошибка сохранения расписаний:", error);
        });
}

function migrateOldHistory() {
    if (localStorage.getItem(STORAGE_SCHEDULES)) return;

    const raw = localStorage.getItem(STORAGE_OLD_HISTORY);

    if (!raw) return;

    try {
        const history = JSON.parse(raw);

        if (Array.isArray(history)) {
            const schedules = history
                .map(normalizeSchedule)
                .filter(Boolean);

            localStorage.setItem(
                STORAGE_SCHEDULES,
                JSON.stringify(schedules)
            );
        }
    } catch (error) {
        console.error("Ошибка переноса старой истории:", error);
    }
}

// ==================================================
// ЗАГРУЗКА И СИНХРОНИЗАЦИЯ FIREBASE
// ==================================================

async function loadInitialCloudData() {
    migrateOldHistory();

    const [employeesSnapshot, schedulesSnapshot] = await Promise.all([
        getDoc(EMPLOYEES_DOC),
        getDoc(SCHEDULES_DOC)
    ]);

    if (
        employeesSnapshot.exists() &&
        Array.isArray(employeesSnapshot.data().items)
    ) {
        localStorage.setItem(
            STORAGE_EMPLOYEES,
            JSON.stringify(
                employeesSnapshot.data().items.map(normalizePerson)
            )
        );
    } else {
        await setDoc(EMPLOYEES_DOC, {
            items: getEmployees(),
            updatedAt: new Date().toISOString()
        });
    }

    if (
        schedulesSnapshot.exists() &&
        Array.isArray(schedulesSnapshot.data().items)
    ) {
        localStorage.setItem(
            STORAGE_SCHEDULES,
            JSON.stringify(
                schedulesSnapshot.data().items
                    .map(normalizeSchedule)
                    .filter(Boolean)
            )
        );
    } else {
        await setDoc(SCHEDULES_DOC, {
            items: getSchedules(),
            updatedAt: new Date().toISOString()
        });
    }

    cloudReady = true;
}

function startCloudListeners() {
    onSnapshot(EMPLOYEES_DOC, snapshot => {
        if (
            !snapshot.exists() ||
            !Array.isArray(snapshot.data().items)
        ) {
            return;
        }

        applyingRemoteData = true;

        localStorage.setItem(
            STORAGE_EMPLOYEES,
            JSON.stringify(snapshot.data().items.map(normalizePerson))
        );

        applyingRemoteData = false;

        if (!settingsModal.classList.contains("hidden")) {
            renderEmployees();
        }
    }, error => {
        console.error("Ошибка синхронизации сотрудников:", error);
    });

    onSnapshot(SCHEDULES_DOC, snapshot => {
        if (
            !snapshot.exists() ||
            !Array.isArray(snapshot.data().items)
        ) {
            return;
        }

        const schedules = snapshot.data().items
            .map(normalizeSchedule)
            .filter(Boolean);

        applyingRemoteData = true;

        localStorage.setItem(
            STORAGE_SCHEDULES,
            JSON.stringify(schedules)
        );

        applyingRemoteData = false;

        const current = schedules.find(
            schedule => schedule.date === selectedDate
        );

        if (current) renderSchedule(current);

        if (!historyModal.classList.contains("hidden")) {
            renderHistory();
        }
    }, error => {
        console.error("Ошибка синхронизации расписания:", error);
    });
}

// ==================================================
// ДАТЫ
// ==================================================

function getDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
    return new Date(`${key}T12:00:00`);
}

function formatDate(key) {
    return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(dateFromKey(key));
}

function addDays(key, amount) {
    const date = dateFromKey(key);
    date.setDate(date.getDate() + amount);

    return getDateKey(date);
}

function updateDateUI() {
    currentDateElement.textContent = formatDate(selectedDate);
    datePicker.value = selectedDate;
}

// ==================================================
// ОБЩИЕ ФУНКЦИИ
// ==================================================

function shuffle(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}

function findSchedule(date) {
    return getSchedules().find(schedule => schedule.date === date);
}

function findPersonInGroups(groups, name) {
    for (const group of groups) {
        const person = group.people.find(
            item => normalizeName(item.name) === name
        );

        if (person) return person;
    }

    return null;
}

function countOrdinaryMales(people) {
    return people.filter(person =>
        person.gender === "male" &&
        normalizeName(person.name) !== "Курсант"
    ).length;
}

// ==================================================
// СОЗДАНИЕ РАСПИСАНИЯ
// ==================================================

function createInitialSchedule(date) {
    const employees = getEmployees();

    if (employees.length !== 18) {
        alert(
            `Для автоматического расписания нужно 18 сотрудников.\nСейчас: ${employees.length}`
        );
        return null;
    }

    const kursant = employees.find(
        person => normalizeName(person.name) === "Курсант"
    );

    if (!kursant) {
        alert("В списке сотрудников должен быть Курсант.");
        return null;
    }

    const ordinaryMales = shuffle(
        employees.filter(person =>
            person.gender === "male" &&
            person.id !== kursant.id
        )
    );

    const females = shuffle(
        employees.filter(person => person.gender === "female")
    );

    const groups = [[], [], []];

    ordinaryMales.forEach((person, index) => {
        groups[index % 3].push(person);
    });

    groups[2].push(kursant);

    for (const female of females) {
        const available = groups
            .map((group, index) => ({ group, index }))
            .filter(item => item.group.length < GROUP_SIZE);

        if (!available.length) break;

        const minSize = Math.min(
            ...available.map(item => item.group.length)
        );

        const smallest = available.filter(
            item => item.group.length === minSize
        );

        const selected = smallest[
            Math.floor(Math.random() * smallest.length)
        ];

        selected.group.push(female);
    }

    if (groups.some(group => group.length !== GROUP_SIZE)) {
        alert("Не удалось сформировать группы по 6 человек.");
        return null;
    }

    if (groups.some(group => countOrdinaryMales(group) > 2)) {
        alert("Не удалось соблюсти ограничение по количеству парней.");
        return null;
    }

    return {
        date,
        groups: groups.map((people, index) => ({
            time: TIMES[index],
            people: shuffle(people)
        }))
    };
}

// ==================================================
// РОТАЦИЯ МЕЖДУ ДНЯМИ
// 11 -> 12, 12 -> 13, 13 -> 11
// Курсант остаётся в третьей группе.
// ==================================================

function createNextDaySchedule(previousSchedule, newDate) {
    if (
        !previousSchedule?.groups ||
        previousSchedule.groups.length !== 3
    ) {
        return createInitialSchedule(newDate);
    }

    const oldGroups = previousSchedule.groups;

    const group1 = oldGroups[2].people.filter(
        person => normalizeName(person.name) !== "Курсант"
    );

    const group2 = [...oldGroups[0].people];
    const group3 = [...oldGroups[1].people];

    const kursant = findPersonInGroups(oldGroups, "Курсант");

    let candidateIndex = group3.findIndex(
        person => person.gender === "female"
    );

    if (candidateIndex === -1) {
        candidateIndex = group3.findIndex(person =>
            person.gender === "male" &&
            countOrdinaryMales(group1) < 2
        );
    }

    if (candidateIndex === -1) {
        return createInitialSchedule(newDate);
    }

    group1.push(group3.splice(candidateIndex, 1)[0]);

    if (kursant) group3.push(kursant);

    const allGroups = [group1, group2, group3];

    const invalid = allGroups.some(group =>
        group.length !== GROUP_SIZE ||
        countOrdinaryMales(group) > 2
    );

    if (invalid) {
        return createInitialSchedule(newDate);
    }

    return {
        date: newDate,
        groups: allGroups.map((people, index) => ({
            time: TIMES[index],
            people: shuffle(people)
        }))
    };
}

function saveSchedule(schedule) {
    if (!schedule) return;

    const schedules = getSchedules().filter(
        item => item.date !== schedule.date
    );

    schedules.push(schedule);
    saveSchedules(schedules);
}

function ensureSchedule(date) {
    const existing = findSchedule(date);

    if (existing) return existing;

    const previous = findSchedule(addDays(date, -1));

    const schedule = previous
        ? createNextDaySchedule(previous, date)
        : createInitialSchedule(date);

    if (schedule) saveSchedule(schedule);

    return schedule;
}

function ensureScheduleChain(targetDate) {
    const existing = findSchedule(targetDate);

    if (existing) return existing;

    const earlier = getSchedules()
        .filter(schedule => schedule.date < targetDate)
        .sort((a, b) => b.date.localeCompare(a.date));

    if (!earlier.length) {
        return ensureSchedule(targetDate);
    }

    let current = earlier[0];

    while (current.date < targetDate) {
        const nextDate = addDays(current.date, 1);
        const existingNext = findSchedule(nextDate);

        if (existingNext) {
            current = existingNext;
        } else {
            const next = createNextDaySchedule(current, nextDate);

            if (!next) return null;

            saveSchedule(next);
            current = next;
        }
    }

    return current;
}

function openDate(date) {
    selectedDate = date;
    updateDateUI();

    const schedule = ensureScheduleChain(date);

    if (schedule) {
        renderSchedule(schedule);
    }

    clearSelection();
}

// ==================================================
// ПЕРЕСТАНОВКА СОТРУДНИКОВ
// ==================================================

function swapPeople(firstId, secondId) {
    if (firstId === secondId) return;

    const schedule = findSchedule(selectedDate);

    if (!schedule) return;

    let firstGroupIndex = -1;
    let secondGroupIndex = -1;
    let firstPersonIndex = -1;
    let secondPersonIndex = -1;

    schedule.groups.forEach((group, groupIndex) => {
        group.people.forEach((person, personIndex) => {
            if (person.id === firstId) {
                firstGroupIndex = groupIndex;
                firstPersonIndex = personIndex;
            }

            if (person.id === secondId) {
                secondGroupIndex = groupIndex;
                secondPersonIndex = personIndex;
            }
        });
    });

    if (firstGroupIndex < 0 || secondGroupIndex < 0) return;

    if (firstGroupIndex === secondGroupIndex) {
        clearSelection();
        return;
    }

    const firstPerson =
        schedule.groups[firstGroupIndex].people[firstPersonIndex];

    const secondPerson =
        schedule.groups[secondGroupIndex].people[secondPersonIndex];

    if (
        normalizeName(firstPerson.name) === "Курсант" ||
        normalizeName(secondPerson.name) === "Курсант"
    ) {
        alert("Курсант должен оставаться в группе 13:00–14:00.");
        clearSelection();
        return;
    }

    const firstGroup = [...schedule.groups[firstGroupIndex].people];
    const secondGroup = [...schedule.groups[secondGroupIndex].people];

    firstGroup[firstPersonIndex] = secondPerson;
    secondGroup[secondPersonIndex] = firstPerson;

    if (
        countOrdinaryMales(firstGroup) > 2 ||
        countOrdinaryMales(secondGroup) > 2
    ) {
        alert("В каждой группе может быть не больше 2 обычных парней.");
        clearSelection();
        return;
    }

    schedule.groups[firstGroupIndex].people[firstPersonIndex] = secondPerson;
    schedule.groups[secondGroupIndex].people[secondPersonIndex] = firstPerson;

    saveSchedule(schedule);
    renderSchedule(schedule);
    clearSelection();
}

function selectPerson(personId) {
    if (selectedPersonId === null) {
        selectedPersonId = personId;
        updateSelectedUI();
        moveHint.hidden = false;
        return;
    }

    if (selectedPersonId === personId) {
        clearSelection();
        return;
    }

    swapPeople(selectedPersonId, personId);
}

function updateSelectedUI() {
    document.querySelectorAll(".person").forEach(element => {
        element.classList.toggle(
            "selected",
            element.dataset.personId === selectedPersonId
        );
    });
}

function clearSelection() {
    selectedPersonId = null;
    moveHint.hidden = true;

    document.querySelectorAll(".person.selected").forEach(element => {
        element.classList.remove("selected");
    });
}

// ==================================================
// DRAG & DROP
// ==================================================

function setupDrag(element) {
    element.addEventListener("dragstart", event => {
        selectedPersonId = element.dataset.personId;

        element.classList.add("dragging");

        event.dataTransfer.setData(
            "text/plain",
            selectedPersonId
        );

        event.dataTransfer.effectAllowed = "move";
    });

    element.addEventListener("dragend", () => {
        element.classList.remove("dragging");

        document.querySelectorAll(".drop-active").forEach(item => {
            item.classList.remove("drop-active");
        });

        clearSelection();
    });

    element.addEventListener("dragover", event => {
        event.preventDefault();
        element.classList.add("selected");
    });

    element.addEventListener("dragleave", () => {
        element.classList.remove("selected");
    });

    element.addEventListener("drop", event => {
        event.preventDefault();

        const draggedId = event.dataTransfer.getData("text/plain");
        const targetId = element.dataset.personId;

        element.classList.remove("selected");

        if (draggedId && targetId) {
            swapPeople(draggedId, targetId);
        }
    });
}

// ==================================================
// ОТОБРАЖЕНИЕ РАСПИСАНИЯ
// ==================================================

function renderSchedule(schedule) {
    scheduleElement.innerHTML = "";

    schedule.groups.forEach((group, groupIndex) => {
        const card = document.createElement("section");
        card.className = "schedule-card";
        card.dataset.groupIndex = String(groupIndex);

        const header = document.createElement("div");
        header.className = "schedule-header";

        const headerInfo = document.createElement("div");

        const time = document.createElement("div");
        time.className = "time";
        time.textContent = group.time;

        const count = document.createElement("div");
        count.className = "people-count";
        count.textContent = `${group.people.length} человек`;

        headerInfo.append(time, count);

        const badge = document.createElement("div");
        badge.className = "group-badge";
        badge.textContent = `Группа ${groupIndex + 1}`;

        header.append(headerInfo, badge);

        const people = document.createElement("div");
        people.className = "people";

        group.people.forEach(person => {
            const personElement = document.createElement("div");

            personElement.className = "person";
            personElement.draggable = true;
            personElement.dataset.personId = person.id;

            if (normalizeName(person.name) === "Курсант") {
                personElement.classList.add("kursant");
            }

            const avatar = document.createElement("div");
            avatar.className = `avatar ${person.gender}`;
            avatar.textContent = normalizeName(person.name)
                .charAt(0)
                .toLocaleUpperCase("ru-RU");

            const name = document.createElement("span");
            name.className = "person-name";
            name.textContent = normalizeName(person.name);

            const arrow = document.createElement("span");
            arrow.className = "person-arrow";
            arrow.textContent = "↔";

            personElement.append(avatar, name, arrow);

            personElement.addEventListener("click", () => {
                selectPerson(person.id);
            });

            setupDrag(personElement);
            people.appendChild(personElement);
        });

        card.append(header, people);
        scheduleElement.appendChild(card);
    });

    updateSelectedUI();
}

// ==================================================
// ПЕРЕГЕНЕРАЦИЯ РАСПИСАНИЯ
// ==================================================

function regenerateCurrentDay() {
    const confirmed = confirm(
        `Перегенерировать расписание на ${formatDate(selectedDate)}?`
    );

    if (!confirmed) return;

    const schedule = createInitialSchedule(selectedDate);

    if (!schedule) return;

    saveSchedule(schedule);
    renderSchedule(schedule);
    clearSelection();
}

// ==================================================
// ИСТОРИЯ
// ==================================================

function renderHistory() {
    const schedules = getSchedules()
        .sort((a, b) => b.date.localeCompare(a.date));

    historyList.innerHTML = "";

    if (!schedules.length) {
        const empty = document.createElement("p");
        empty.textContent = "История пока пустая.";
        empty.style.color = "#758391";
        empty.style.fontSize = "12px";

        historyList.appendChild(empty);
        return;
    }

    schedules.forEach(schedule => {
        const item = document.createElement("div");
        item.className = "history-item";

        const date = document.createElement("div");
        date.className = "history-date";
        date.textContent = formatDate(schedule.date);

        item.appendChild(date);

        schedule.groups.forEach(group => {
            const time = document.createElement("div");
            time.className = "history-time";
            time.textContent = group.time;

            const names = document.createElement("div");
            names.className = "history-names";
            names.textContent = group.people
                .map(person => normalizeName(person.name))
                .join(", ");

            item.append(time, names);
        });

        historyList.appendChild(item);
    });
}

// ==================================================
// НАСТРОЙКИ СОТРУДНИКОВ
// ==================================================

function renderEmployees() {
    const employees = getEmployees();

    employeeList.innerHTML = "";

    employees.forEach((person, index) => {
        const item = document.createElement("div");
        item.className = "employee-item";

        const info = document.createElement("div");
        info.className = "employee-info";

        const strong = document.createElement("strong");
        strong.textContent = person.name;

        const gender = document.createElement("span");
        gender.className = "gender-label";
        gender.textContent = person.gender === "male"
            ? "парень"
            : "девушка";

        info.append(strong, gender);

        if (person.fixed) {
            const fixed = document.createElement("span");
            fixed.className = "gender-label";
            fixed.textContent = "• всегда 13:00";

            info.appendChild(fixed);
        }

        const remove = document.createElement("button");
        remove.className = "delete-employee";
        remove.dataset.index = String(index);
        remove.textContent = "×";

        item.append(info, remove);
        employeeList.appendChild(item);
    });

    employeeList.querySelectorAll(".delete-employee").forEach(button => {
        button.addEventListener("click", () => {
            const index = Number(button.dataset.index);
            const employees = getEmployees();

            if (employees[index]?.name === "Курсант") {
                alert("Курсант не может быть удалён.");
                return;
            }

            if (employees.length <= 18) {
                alert("В автоматическом режиме должно быть 18 сотрудников.");
                return;
            }

            employees.splice(index, 1);

            saveEmployees(employees);
            renderEmployees();
        });
    });
}

function addEmployee() {
    const name = normalizeName(employeeName.value);
    const gender = employeeGender.value;

    if (!name) {
        alert("Введите имя сотрудника.");
        return;
    }

    const employees = getEmployees();

    const exists = employees.some(person =>
        person.name.toLocaleLowerCase("ru-RU") ===
        name.toLocaleLowerCase("ru-RU")
    );

    if (exists) {
        alert("Такой сотрудник уже есть.");
        return;
    }

    employees.push({
        id: `${createIdFromName(name)}-${Date.now()}`,
        name,
        gender: gender === "male" ? "male" : "female",
        fixed: false
    });

    saveEmployees(employees);

    employeeName.value = "";
    renderEmployees();
}

// ==================================================
// СОБЫТИЯ ИНТЕРФЕЙСА
// ==================================================

function attachEvents() {
    previousDayButton.addEventListener("click", () => {
        openDate(addDays(selectedDate, -1));
    });

    nextDayButton.addEventListener("click", () => {
        openDate(addDays(selectedDate, 1));
    });

    todayButton.addEventListener("click", () => {
        openDate(getDateKey());
    });

    datePicker.addEventListener("change", () => {
        if (datePicker.value) {
            openDate(datePicker.value);
        }
    });

    generateButton.addEventListener("click", regenerateCurrentDay);

    settingsButton.addEventListener("click", () => {
        renderEmployees();
        settingsModal.classList.remove("hidden");
    });

    closeSettings.addEventListener("click", () => {
        settingsModal.classList.add("hidden");
    });

    addEmployeeButton.addEventListener("click", addEmployee);

    employeeName.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            addEmployee();
        }
    });

    showHistoryButton.addEventListener("click", () => {
        renderHistory();
        historyModal.classList.remove("hidden");
    });

    closeHistory.addEventListener("click", () => {
        historyModal.classList.add("hidden");
    });

    cancelMoveButton.addEventListener("click", clearSelection);

    settingsModal.addEventListener("click", event => {
        if (event.target === settingsModal) {
            settingsModal.classList.add("hidden");
        }
    });

    historyModal.addEventListener("click", event => {
        if (event.target === historyModal) {
            historyModal.classList.add("hidden");
        }
    });
}

// ==================================================
// ПРОВЕРКА HTML
// ==================================================

function checkRequiredElements() {
    const required = {
        app,
        scheduleElement,
        currentDateElement,
        datePicker,
        previousDayButton,
        nextDayButton,
        todayButton,
        generateButton,
        settingsButton,
        settingsModal,
        closeSettings,
        employeeList,
        employeeName,
        employeeGender,
        addEmployeeButton,
        showHistoryButton,
        historyModal,
        closeHistory,
        historyList,
        moveHint,
        cancelMoveButton
    };

    const missing = Object.entries(required)
        .filter(([, element]) => !element)
        .map(([name]) => name);

    if (missing.length) {
        throw new Error(
            `В index.html отсутствуют элементы: ${missing.join(", ")}`
        );
    }
}

// ==================================================
// ЗАПУСК
// ==================================================

async function initialize() {
    try {
        checkRequiredElements();
        attachEvents();

        await loadInitialCloudData();

        // Исправляем старые варианты написания имён.
        saveEmployees(getEmployees());
        saveSchedules(getSchedules());

        openDate(getDateKey());

        app.hidden = false;

        startCloudListeners();

        if (loadingScreen) {
            setTimeout(() => {
                loadingScreen.classList.add("hide");

                setTimeout(() => {
                    loadingScreen.remove();
                }, 500);
            }, 500);
        }

        console.log("Рандомайзер запущен.");
    } catch (error) {
        console.error("Ошибка запуска:", error);

        if (loadingScreen) {
            loadingScreen.classList.add("hide");

            setTimeout(() => {
                loadingScreen.remove();
            }, 500);
        }

        alert(
            "Не удалось загрузить приложение. Проверь Firebase и правила Firestore. Подробности смотри в консоли разработчика."
        );
    }
}

setInterval(() => {
    if (!cloudReady) return;

    const today = getDateKey();

    if (selectedDate === today && !findSchedule(today)) {
        const schedule = ensureScheduleChain(today);

        if (schedule) {
            renderSchedule(schedule);
        }
    }
}, 60000);

initialize();