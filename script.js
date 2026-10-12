// ===== CGPA Tracker =====
// Type a SCORE and the UNITS for each course. The grade and points are worked out for you.
//
//   TCP = Total Credit Points = every course's (units x grade point), added up
//   TLU = Total Load Units    = every course's units, added up
//   GPA = TCP / TLU
//   CGPA = the same sum over every semester together

// The name we save our data under in localStorage
const STORAGE_KEY = "gpaDataV3";

// The ids of our two semesters (they match the ids in index.html)
const SEMESTERS = ["sem1", "sem2"];

// All the grade letters, best to worst
const GRADE_LETTERS = ["A", "B", "C", "D", "E", "F"];


// ----- GRADING -----

// Turn a score into a grade letter and a grade point (5.0 scale)
function getGrade(score) {
  if (score >= 70) return { letter: "A", point: 5 };
  if (score >= 60) return { letter: "B", point: 4 };
  if (score >= 50) return { letter: "C", point: 3 };
  if (score >= 45) return { letter: "D", point: 2 };
  if (score >= 40) return { letter: "E", point: 1 };
  return { letter: "F", point: 0 };
}

// Turn a CGPA number into a class of degree
function getClassOfDegree(gpa) {
  if (gpa >= 4.5) return "First Class";
  if (gpa >= 3.5) return "Second Class Upper";
  if (gpa >= 2.4) return "Second Class Lower";
  if (gpa >= 1.5) return "Third Class";
  return "Pass";
}

// GPA = TCP / TLU (and 0 if there are no units yet)
function calcGpa(tcp, tlu) {
  if (tlu > 0) {
    return tcp / tlu;
  }
  return 0;
}


// ----- LOCAL STORAGE -----

// Save our data in the browser
function saveData(data) {
  try {
    // JSON.stringify turns the data into text, because localStorage only stores text
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    // Saving can fail (for example in private browsing). The tracker still works.
  }
}

// Get our saved data back (returns null if nothing is saved)
function loadData() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text === null) {
      return null;
    }
    // JSON.parse turns the text back into real data
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}


// ----- COURSE ROWS -----

// Get the box that holds a semester's courses, e.g. getList("sem1")
function getList(semId) {
  return document.getElementById(semId + "-list");
}

// Add one course to a semester
function addRow(semId, code = "", score = "", units = "") {
  const row = document.createElement("div");
  row.className = "course";

  row.innerHTML = `
    <input type="text" class="code" placeholder="COS111" aria-label="Course code">
    <input type="number" class="score" min="0" max="100" placeholder="0-100" inputmode="numeric" aria-label="Score">
    <input type="number" class="units" min="0" max="10" placeholder="3" inputmode="numeric" aria-label="Units">
    <button type="button" class="remove" aria-label="Remove course">&times;</button>
    <div class="result">
      <span class="chip">-</span>
      <span class="result-text">Enter a score and units</span>
    </div>
  `;

  // Fill in the values (used when loading saved courses or imported ones)
  row.querySelector(".code").value = code;
  row.querySelector(".score").value = score;
  row.querySelector(".units").value = units;

  // When the x button is clicked: delete this course and recalculate
  row.querySelector(".remove").addEventListener("click", function () {
    row.remove();
    calculateAll();
  });

  getList(semId).appendChild(row);
}


// ----- CALCULATION -----

// Work out TCP and TLU for ONE semester.
// It also fills in the grade chip and the little result line under every course.
function calculateSemester(semId) {
  const rows = getList(semId).querySelectorAll(".course");

  let tcp = 0;
  let tlu = 0;
  const courses = []; // what the user typed, so we can save it
  const gradeCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };

  // Go through every course, one at a time
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const scoreInput = row.querySelector(".score");
    const unitsInput = row.querySelector(".units");
    const chip = row.querySelector(".chip");
    const resultText = row.querySelector(".result-text");

    const code = row.querySelector(".code").value;
    const scoreText = scoreInput.value.trim();
    const unitsText = unitsInput.value.trim();

    courses.push({ code: code, score: scoreText, units: unitsText });

    // Start with an empty result for this course
    chip.textContent = "-";
    chip.className = "chip";
    resultText.textContent = "Enter a score and units";

    // A score must be a number from 0 to 100. Units must be more than 0.
    const score = Number(scoreText);
    const units = Number(unitsText);
    const scoreBad = scoreText !== "" && (score < 0 || score > 100);
    const unitsBad = unitsText !== "" && !(units > 0);

    // Turn the box red if something was typed but it is not valid
    scoreInput.classList.toggle("invalid", scoreBad);
    unitsInput.classList.toggle("invalid", unitsBad);

    if (scoreBad) {
      resultText.textContent = "Score must be between 0 and 100";
    } else if (unitsBad) {
      resultText.textContent = "Units must be more than 0";
    } else if (scoreText !== "" && unitsText !== "") {
      // Both are valid, so this course counts
      const grade = getGrade(score);
      const cp = units * grade.point; // credit points for this course

      tcp = tcp + cp;
      tlu = tlu + units;
      gradeCounts[grade.letter] = gradeCounts[grade.letter] + 1;

      chip.textContent = grade.letter;
      chip.className = "chip g-" + grade.letter;
      resultText.textContent = grade.point + " points x " + units + " units = " + cp + " CP";
    }
  }

  return { tcp: tcp, tlu: tlu, courses: courses, gradeCounts: gradeCounts };
}

// Read one number from a box (blank or invalid counts as 0)
function readNumber(id) {
  const value = Number(document.getElementById(id).value);
  if (isNaN(value) || value < 0) {
    return 0;
  }
  return value;
}

// Draw the coloured grade bar in the top card
function showDistribution(counts) {
  const bar = document.getElementById("dist");
  bar.innerHTML = "";

  let total = 0;
  for (let i = 0; i < GRADE_LETTERS.length; i++) {
    total = total + counts[GRADE_LETTERS[i]];
  }

  // Nothing to show yet
  if (total === 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;

  // One coloured slice for each grade that appears
  for (let i = 0; i < GRADE_LETTERS.length; i++) {
    const letter = GRADE_LETTERS[i];
    if (counts[letter] > 0) {
      const slice = document.createElement("span");
      slice.className = "seg g-" + letter;
      slice.style.flex = counts[letter]; // wider slice = more courses
      slice.textContent = letter + " " + counts[letter];
      bar.appendChild(slice);
    }
  }
}

// Recalculate everything, show it, and save it
function calculateAll() {
  const prevTlu = readNumber("prev-tlu");
  const prevTcp = readNumber("prev-tcp");
  const sem1 = calculateSemester("sem1");
  const sem2 = calculateSemester("sem2");

  // Each semester's own results
  document.getElementById("sem1-tcp").textContent = sem1.tcp;
  document.getElementById("sem1-tlu").textContent = sem1.tlu;
  document.getElementById("sem1-gpa").textContent = calcGpa(sem1.tcp, sem1.tlu).toFixed(2);

  document.getElementById("sem2-tcp").textContent = sem2.tcp;
  document.getElementById("sem2-tlu").textContent = sem2.tlu;
  document.getElementById("sem2-gpa").textContent = calcGpa(sem2.tcp, sem2.tlu).toFixed(2);

  document.getElementById("prev-gpa").textContent = calcGpa(prevTcp, prevTlu).toFixed(2);

  // CGPA = everything added together: earlier totals + both semesters
  const totalTcp = prevTcp + sem1.tcp + sem2.tcp;
  const totalTlu = prevTlu + sem1.tlu + sem2.tlu;
  const cgpa = calcGpa(totalTcp, totalTlu);

  document.getElementById("total-tcp").textContent = totalTcp;
  document.getElementById("total-tlu").textContent = totalTlu;
  document.getElementById("cgpa").textContent = cgpa.toFixed(2);

  if (totalTlu > 0) {
    document.getElementById("classOfDegree").textContent = getClassOfDegree(cgpa);
  } else {
    document.getElementById("classOfDegree").textContent = "Add your courses to begin";
  }

  // Count the grades from both semesters for the grade bar
  const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  for (let i = 0; i < GRADE_LETTERS.length; i++) {
    const letter = GRADE_LETTERS[i];
    counts[letter] = sem1.gradeCounts[letter] + sem2.gradeCounts[letter];
  }
  showDistribution(counts);

  // Save everything in localStorage
  saveData({
    prev: { tlu: prevTlu, tcp: prevTcp },
    sem1: sem1.courses,
    sem2: sem2.courses,
  });
}


// ----- BUTTONS AND TYPING -----

// Recalculate when the user types in the "earlier totals" boxes
document.getElementById("prev-tlu").addEventListener("input", calculateAll);
document.getElementById("prev-tcp").addEventListener("input", calculateAll);

// Set up the buttons for each semester
for (let i = 0; i < SEMESTERS.length; i++) {
  const semId = SEMESTERS[i];
  const list = getList(semId);

  // Recalculate whenever the user types in a course
  list.addEventListener("input", calculateAll);

  // "Add course" button
  document.getElementById(semId + "-add").addEventListener("click", function () {
    addRow(semId);
    calculateAll();
  });

  // "Clear" button
  document.getElementById(semId + "-clear").addEventListener("click", function () {
    list.innerHTML = "";
    addRow(semId);
    calculateAll();
  });
}


// ----- START UP -----

// When the page opens, load any saved data
const savedData = loadData();

// Put back the earlier totals (and open that section if there are any)
if (savedData !== null && savedData.prev) {
  const p = savedData.prev;

  if (p.tlu > 0) {
    document.getElementById("prev-tlu").value = p.tlu;
  }
  if (p.tcp > 0) {
    document.getElementById("prev-tcp").value = p.tcp;
  }
  if (p.tlu > 0 || p.tcp > 0) {
    document.getElementById("prev-details").open = true;
  }
}

// Put back the saved courses for each semester
for (let i = 0; i < SEMESTERS.length; i++) {
  const semId = SEMESTERS[i];

  if (savedData !== null && Array.isArray(savedData[semId])) {
    const courses = savedData[semId];
    for (let j = 0; j < courses.length; j++) {
      addRow(semId, courses[j].code, courses[j].score, courses[j].units);
    }
  }

  // If the semester is still empty, start with one blank course
  if (getList(semId).children.length === 0) {
    addRow(semId);
  }
}

calculateAll();
