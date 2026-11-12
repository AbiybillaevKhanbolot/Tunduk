
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

const MAX_GROUP_SIZE = 6;
const MAX_ORDINARY_MALES = 2;

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

function isRemovedEmployee(person) {
    const name = normalizeName(person?.name).toLocaleLowerCase("ru-RU");
    const id = String(person?.id ?? "").toLowerCase();

    return name === "гулназ" || id === "gulnaz";
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

function cleanEmployees(employees) {
    if (!Array.isArray(employees)) return [];

    return employees
        .filter(person => !isRemovedEmployee(person))
        .map(normalizePerson);
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
                    ? group.people
                        .filter(person => !isRemovedEmployee(person))
                        .map(normalizePerson)
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
            return cleanEmployees(DEFAULT_EMPLOYEES);
        }

        const employees = JSON.parse(raw);

        if (!Array.isArray(employees)) {
            throw new Error("Неверный формат списка сотрудников");
        }

        return cleanEmployees(employees);
    } catch (error) {
        console.error("Ошибка чтения сотрудников:", error);
        return cleanEmployees(DEFAULT_EMPLOYEES);
    }
}

function saveEmployees(employees) {
    const normalized = cleanEmployees(employees);

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

        return schedules
            .map(normalizeSchedule)
            .filter(Boolean);
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
// FIREBASE
// ==================================================

async function loadInitialCloudData() {
    migrateOldHistory();

    const [employeesSnapshot, schedulesSnapshot] = await Promise.all([
        getDoc(EMPLOYEES_DOC),
        getDoc(SCHEDULES_DOC)
    ]);

    let employees;

    if (
        employeesSnapshot.exists() &&
        Array.isArray(employeesSnapshot.data().items)
    ) {
        employees = cleanEmployees(employeesSnapshot.data().items);
    } else {
        employees = cleanEmployees(DEFAULT_EMPLOYEES);
    }

    // Сразу сохраняем очищенный список в Firebase.
    await setDoc(EMPLOYEES_DOC, {
        items: employees,
        updatedAt: new Date().toISOString()
    });

    localStorage.setItem(
        STORAGE_EMPLOYEES,
        JSON.stringify(employees)
    );

    if (
        schedulesSnapshot.exists() &&
        Array.isArray(schedulesSnapshot.data().items)
    ) {
        const schedules = schedulesSnapshot.data().items
            .map(normalizeSchedule)
            .filter(Boolean);

        localStorage.setItem(
            STORAGE_SCHEDULES,
            JSON.stringify(schedules)
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

        const employees = cleanEmployees(snapshot.data().items);

        applyingRemoteData = true;

        localStorage.setItem(
            STORAGE_EMPLOYEES,
            JSON.stringify(employees)
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

        if (current && scheduleMatchesEmployees(current)) {
            renderSchedule(current);
        } else {
            const updated = ensureScheduleChain(selectedDate);
            if (updated) renderSchedule(updated);
        }

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
// РАЗМЕРЫ ГРУПП
// 17 человек = 6 / 6 / 5
// ==================================================

function getGroupSizes(employeeCount) {
    const base = Math.floor(employeeCount / 3);
    const remainder = employeeCount % 3;

    return [
        base + (remainder > 0 ? 1 : 0),
        base + (remainder > 1 ? 1 : 0),
        base
    ];
}

function scheduleMatchesEmployees(schedule) {
    if (!schedule || !Array.isArray(schedule.groups)) {
        return false;
    }

    const employees = getEmployees();
    const sizes = getGroupSizes(employees.length);

    if (employees.length === 0) return false;

    if (schedule.groups.length !== 3) return false;

    const schedulePeople = schedule.groups.flatMap(
        group => group.people
    );

    const scheduleIds = schedulePeople.map(person => person.id);
    const employeeIds = employees.map(person => person.id);

    if (scheduleIds.length !== employeeIds.length) return false;

    if (new Set(scheduleIds).size !== scheduleIds.length) {
        return false;
    }

    if (!employeeIds.every(id => scheduleIds.includes(id))) {
        return false;
    }

    if (
        schedule.groups.some(
            (group, index) => group.people.length !== sizes[index]
        )
    ) {
        return false;
    }

    if (
        schedule.groups.some(
            group => countOrdinaryMales(group.people) > MAX_ORDINARY_MALES
        )
    ) {
        return false;
    }

    const kursantGroup = schedule.groups[2].people.some(
        person => normalizeName(person.name) === "Курсант"
    );

    return kursantGroup;
}

// ==================================================
// СОЗДАНИЕ ПЕРВИЧНОГО РАСПИСАНИЯ
// ==================================================

function createInitialSchedule(date) {
    const employees = shuffle(getEmployees());

    if (employees.length < 3 || employees.length > 18) {
        alert(
            `Для автоматического расписания нужно от 3 до 18 сотрудников.\nСейчас: ${employees.length}`
        );
        return null;
    }

    const sizes = getGroupSizes(employees.length);

    if (sizes.some(size => size > MAX_GROUP_SIZE)) {
        alert("В одной группе не может быть больше 6 человек.");
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
        employees.filter(person =>
            person.gender === "female"
        )
    );

    if (ordinaryMales.length > MAX_ORDINARY_MALES * 3) {
        alert("Слишком много парней для текущего ограничения.");
        return null;
    }

    const groups = [[], [], []];

    // Курсант всегда в третьей группе.
    groups[2].push(kursant);

    // Распределяем обычных парней равномерно.
    for (const person of ordinaryMales) {
        const available = groups
            .map((group, index) => ({
                group,
                index
            }))
            .filter(item =>
                item.group.length < sizes[item.index] &&
                countOrdinaryMales(item.group) < MAX_ORDINARY_MALES
            );

        if (!available.length) {
            alert("Невозможно распределить парней по группам.");
            return null;
        }

        available.sort((a, b) => {
            const maleDifference =
                countOrdinaryMales(a.group) -
                countOrdinaryMales(b.group);

            if (maleDifference !== 0) return maleDifference;

            return a.group.length - b.group.length;
        });

        available[0].group.push(person);
    }

    // Заполняем оставшиеся места девушками.
    for (const person of females) {
        const available = groups
            .map((group, index) => ({
                group,
                index
            }))
            .filter(item =>
                item.group.length < sizes[item.index]
            );

        if (!available.length) break;

        available.sort((a, b) =>
            a.group.length - b.group.length
        );

        const smallestSize = available[0].group.length;

        const smallestGroups = available.filter(
            item => item.group.length === smallestSize
        );

        const selected = smallestGroups[
            Math.floor(Math.random() * smallestGroups.length)
        ];

        selected.group.push(person);
    }

    if (
        groups.some(
            (group, index) => group.length !== sizes[index]
        )
    ) {
        alert("Не удалось сформировать все группы.");
        return null;
    }

    if (
        groups.some(
            group => countOrdinaryMales(group) > MAX_ORDINARY_MALES
        )
    ) {
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
// ==================================================

function createNextDaySchedule(previousSchedule, newDate) {
    const employees = getEmployees();

    // Если состав сотрудников изменился — создаём новое расписание.
    if (!scheduleMatchesEmployees(previousSchedule)) {
        return createInitialSchedule(newDate);
    }

    const oldGroups = previousSchedule.groups;
    const sizes = getGroupSizes(employees.length);

    const oldGroup1 = [...oldGroups[0].people];
    const oldGroup2 = [...oldGroups[1].people];

    const oldGroup3 = oldGroups[2].people.filter(
        person => normalizeName(person.name) !== "Курсант"
    );

    const kursant = findPersonInGroups(oldGroups, "Курсант");

    if (!kursant) {
        return createInitialSchedule(newDate);
    }

    // Новая первая группа получает сотрудников из третьей.
    const newGroup1 = [...oldGroup3];

    // Новая вторая группа получает сотрудников из первой.
    const newGroup2 = [...oldGroup1];

    // Новая третья группа получает сотрудников из второй.
    const newGroup3 = [...oldGroup2];

    // Курсант остаётся в третьей группе.
    newGroup3.push(kursant);

    // При составе 17 человек нужно переместить двух сотрудников
    // из новой третьей группы в новую первую.
    const needed = sizes[0] - newGroup1.length;

    if (needed > 0) {
        const candidates = shuffle([...newGroup3].filter(
            person => normalizeName(person.name) !== "Курсант"
        ));

        // Сначала рассматриваем девушек, чтобы не нарушать
        // ограничение по количеству парней.
        candidates.sort((a, b) => {
            if (a.gender === "female" && b.gender === "male") return -1;
            if (a.gender === "male" && b.gender === "female") return 1;
            return 0;
        });

        let selected = null;

        function findTransfer(startIndex, chosen) {
            if (chosen.length === needed) {
                const chosenIds = new Set(
                    chosen.map(person => person.id)
                );

                const testGroup1 = [...newGroup1, ...chosen];

                const testGroup3 = newGroup3.filter(
                    person => !chosenIds.has(person.id)
                );

                if (
                    testGroup1.length === sizes[0] &&
                    testGroup3.length === sizes[2] &&
                    countOrdinaryMales(testGroup1) <= MAX_ORDINARY_MALES &&
                    countOrdinaryMales(testGroup3) <= MAX_ORDINARY_MALES
                ) {
                    selected = [...chosen];
                    return true;
                }

                return false;
            }

            for (let i = startIndex; i < candidates.length; i++) {
                chosen.push(candidates[i]);

                if (findTransfer(i + 1, chosen)) {
                    return true;
                }

                chosen.pop();
            }

            return false;
        }

        if (!findTransfer(0, [])) {
            return createInitialSchedule(newDate);
        }

        const selectedIds = new Set(
            selected.map(person => person.id)
        );

        newGroup1.push(...selected);

        for (let i = newGroup3.length - 1; i >= 0; i--) {
            if (selectedIds.has(newGroup3[i].id)) {
                newGroup3.splice(i, 1);
            }
        }
    }

    const allGroups = [
        newGroup1,
        newGroup2,
        newGroup3
    ];

    const invalid = allGroups.some((group, index) =>
        group.length !== sizes[index] ||
        countOrdinaryMales(group) > MAX_ORDINARY_MALES
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

// ==================================================
// СОХРАНЕНИЕ РАСПИСАНИЯ
// ==================================================

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

    if (existing && scheduleMatchesEmployees(existing)) {
        return existing;
    }

    const previous = findSchedule(addDays(date, -1));

    let schedule;

    if (previous && scheduleMatchesEmployees(previous)) {
        schedule = createNextDaySchedule(previous, date);
    } else {
        schedule = createInitialSchedule(date);
    }

    if (schedule) saveSchedule(schedule);

    return schedule;
}

function ensureScheduleChain(targetDate) {
    const existing = findSchedule(targetDate);

    if (existing && scheduleMatchesEmployees(existing)) {
        return existing;
    }

    const earlier = getSchedules()
        .filter(schedule =>
            schedule.date < targetDate &&
            scheduleMatchesEmployees(schedule)
        )
        .sort((a, b) => b.date.localeCompare(a.date));

    if (!earlier.length) {
        return ensureSchedule(targetDate);
    }

    let current = earlier[0];

    while (current.date < targetDate) {
        const nextDate = addDays(current.date, 1);
        const existingNext = findSchedule(nextDate);

        if (
            existingNext &&
            scheduleMatchesEmployees(existingNext)
        ) {
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
        countOrdinaryMales(firstGroup) > MAX_ORDINARY_MALES ||
        countOrdinaryMales(secondGroup) > MAX_ORDINARY_MALES
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

            if (employees.length <= 3) {
                alert("Нельзя оставить меньше трёх сотрудников.");
                return;
            }

            const removed = employees[index];

            if (!removed) return;

            const confirmed = confirm(
                `Удалить сотрудника ${removed.name}?`
            );

            if (!confirmed) return;

            employees.splice(index, 1);

            saveEmployees(employees);

            // Текущий день формируется заново под новый состав.
            const newSchedule = createInitialSchedule(selectedDate);

            if (newSchedule) {
                saveSchedule(newSchedule);
                renderSchedule(newSchedule);
            }

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

    if (employees.length >= 18) {
        alert("Максимальное количество сотрудников — 18.");
        return;
    }

    employees.push({
        id: `${createIdFromName(name)}-${Date.now()}`,
        name,
        gender: gender === "male" ? "male" : "female",
        fixed: false
    });

    saveEmployees(employees);

    const newSchedule = createInitialSchedule(selectedDate);

    if (newSchedule) {
        saveSchedule(newSchedule);
        renderSchedule(newSchedule);
    }

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

        // Сохраняем очищенный список и нормализованные расписания.
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
        console.log("Сотрудников:", getEmployees().length);
        console.log("Размер групп:", getGroupSizes(getEmployees().length));

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

// ==================================================
// АВТОПРОВЕРКА РАСПИСАНИЯ
// ==================================================

setInterval(() => {
    if (!cloudReady) return;

    const today = getDateKey();

    if (selectedDate === today) {
        const current = findSchedule(today);

        if (!current || !scheduleMatchesEmployees(current)) {
            const schedule = ensureScheduleChain(today);

            if (schedule) {
                renderSchedule(schedule);
            }
        }
    }
}, 60000);

initialize();
