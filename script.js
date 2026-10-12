// ===== GPA & CGPA Calculator (score-based) =====
// You type the SCORE and the UNITS. The grade, point and CP are worked out for you.
//
//   CP   = Credit Point = units x grade point
//   TNU  = Total Number of Units
//   TNUP = Total Number of Units Passed (score 40 and above)
//   TCP  = Total Credit Points
//   GPA  = TCP / TNU
//
//   CUR = this semester only
//   CUM = everything so far (previous totals + this semester)

// The name we save our data under in localStorage
const STORAGE_KEY = "gpaDataV2";

// The ids of our two semesters (they match the ids in index.html)
const SEMESTERS = ["sem1", "sem2"];


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

// GPA = TCP / TNU (and 0 if there are no units yet)
function calcGpa(tcp, tnu) {
  if (tnu > 0) {
    return tcp / tnu;
  }
  return 0;
}

// Add two sets of totals together
function addTotals(a, b) {
  return {
    tnu: a.tnu + b.tnu,
    tnup: a.tnup + b.tnup,
    tcp: a.tcp + b.tcp,
  };
}


// ----- LOCAL STORAGE -----

// Save our data in the browser
function saveData(data) {
  try {
    // JSON.stringify turns the data into text, because localStorage only stores text
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    // Saving can fail (for example in private browsing). The calculator still works.
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


// ----- ROWS -----

// Get the <tbody> of a semester, e.g. getTbody("sem1")
function getTbody(semId) {
  return document.getElementById(semId + "-courses");
}

// Add one course row to a semester's table
function addRow(semId, code = "", score = "", units = "") {
  const row = document.createElement("tr");

  row.innerHTML = `
    <td><input type="text" class="code" placeholder="COS111"></td>
    <td><input type="number" class="score" min="0" max="100" placeholder="0-100" inputmode="numeric"></td>
    <td><input type="number" class="units" min="0" max="10" placeholder="3" inputmode="numeric"></td>
    <td class="grade-cell">-</td>
    <td class="point-cell">-</td>
    <td class="cp-cell">-</td>
    <td><button type="button" class="remove">&times;</button></td>
  `;

  // Fill in the values (used when loading saved courses)
  row.querySelector(".code").value = code;
  row.querySelector(".score").value = score;
  row.querySelector(".units").value = units;

  // When the x button is clicked: delete this row and recalculate
  row.querySelector(".remove").addEventListener("click", function () {
    row.remove();
    calculateAll();
  });

  getTbody(semId).appendChild(row);
}


// ----- CALCULATION -----

// Work out TNU, TNUP and TCP for ONE semester.
// It also fills in the Grade, Pt and CP columns of every row.
function calculateSemester(semId) {
  const rows = getTbody(semId).querySelectorAll("tr");

  const totals = { tnu: 0, tnup: 0, tcp: 0 };
  const courses = []; // what the user typed, so we can save it

  // Go through every row, one at a time
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const scoreInput = row.querySelector(".score");
    const unitsInput = row.querySelector(".units");
    const gradeCell = row.querySelector(".grade-cell");
    const pointCell = row.querySelector(".point-cell");
    const cpCell = row.querySelector(".cp-cell");

    const code = row.querySelector(".code").value;
    const scoreText = scoreInput.value.trim();
    const unitsText = unitsInput.value.trim();

    courses.push({ code: code, score: scoreText, units: unitsText });

    // Start with empty results for this row
    gradeCell.textContent = "-";
    gradeCell.className = "grade-cell";
    pointCell.textContent = "-";
    cpCell.textContent = "-";

    // A score must be a number from 0 to 100. Units must be more than 0.
    const score = Number(scoreText);
    const units = Number(unitsText);
    const scoreOk = scoreText !== "" && score >= 0 && score <= 100;
    const unitsOk = unitsText !== "" && units > 0;

    // Turn the box red if something was typed but it is not valid
    scoreInput.classList.toggle("invalid", scoreText !== "" && !scoreOk);
    unitsInput.classList.toggle("invalid", unitsText !== "" && !unitsOk);

    // Only rows with a valid score AND valid units are counted
    if (scoreOk && unitsOk) {
      const grade = getGrade(score);
      const cp = units * grade.point;

      totals.tnu = totals.tnu + units;
      totals.tcp = totals.tcp + cp;

      // A course is "passed" when the score is 40 or more
      if (score >= 40) {
        totals.tnup = totals.tnup + units;
      }

      // Show this row's results
      gradeCell.textContent = grade.letter;
      gradeCell.className = "grade-cell grade-" + grade.letter;
      pointCell.textContent = grade.point;
      cpCell.textContent = cp;
    }
  }

  return { totals: totals, courses: courses };
}

// Read one number from a box (blank or invalid counts as 0)
function readNumber(id) {
  const value = Number(document.getElementById(id).value);
  if (isNaN(value) || value < 0) {
    return 0;
  }
  return value;
}

// Read the "previous totals" boxes
function readPrevious() {
  return {
    tnu: readNumber("prev-tnu"),
    tnup: readNumber("prev-tnup"),
    tcp: readNumber("prev-tcp"),
  };
}

// Show one row of a summary table. prefix is like "sem1-cur" or "sem2-cum".
function showSummaryRow(prefix, totals) {
  document.getElementById(prefix + "-tnu").textContent = totals.tnu;
  document.getElementById(prefix + "-tnup").textContent = totals.tnup;
  document.getElementById(prefix + "-tcp").textContent = totals.tcp;
  document.getElementById(prefix + "-gpa").textContent =
    calcGpa(totals.tcp, totals.tnu).toFixed(2);
}

// Recalculate everything, show it, and save it
function calculateAll() {
  const prev = readPrevious();
  const sem1 = calculateSemester("sem1");
  const sem2 = calculateSemester("sem2");

  // CUM after 1st semester = previous + 1st semester
  // CUM after 2nd semester = that + 2nd semester
  const cum1 = addTotals(prev, sem1.totals);
  const cum2 = addTotals(cum1, sem2.totals);

  document.getElementById("prev-gpa").textContent =
    calcGpa(prev.tcp, prev.tnu).toFixed(2);

  showSummaryRow("sem1-cur", sem1.totals);
  showSummaryRow("sem1-cum", cum1);
  showSummaryRow("sem2-cur", sem2.totals);
  showSummaryRow("sem2-cum", cum2);

  // The big CGPA is the CUM after the second semester
  const cgpa = calcGpa(cum2.tcp, cum2.tnu);

  document.getElementById("total-tcp").textContent = cum2.tcp;
  document.getElementById("total-tnu").textContent = cum2.tnu;
  document.getElementById("cgpa").textContent = cgpa.toFixed(2);

  if (cum2.tnu > 0) {
    document.getElementById("classOfDegree").textContent = getClassOfDegree(cgpa);
  } else {
    document.getElementById("classOfDegree").textContent = "";
  }

  // Save everything in localStorage
  saveData({ prev: prev, sem1: sem1.courses, sem2: sem2.courses });
}


// ----- BUTTONS AND TYPING -----

// Recalculate when the user types in the "previous totals" boxes
const prevIds = ["prev-tnu", "prev-tnup", "prev-tcp"];
for (let i = 0; i < prevIds.length; i++) {
  document.getElementById(prevIds[i]).addEventListener("input", calculateAll);
}

// Set up the buttons for each semester
for (let i = 0; i < SEMESTERS.length; i++) {
  const semId = SEMESTERS[i];
  const tbody = getTbody(semId);

  // Recalculate whenever the user types in a row
  tbody.addEventListener("input", calculateAll);

  // "Add course" button
  document.getElementById(semId + "-add").addEventListener("click", function () {
    addRow(semId);
    calculateAll();
  });

  // "Clear" button
  document.getElementById(semId + "-clear").addEventListener("click", function () {
    tbody.innerHTML = "";
    addRow(semId);
    calculateAll();
  });
}


// ----- START UP -----

// When the page opens, load any saved data
const savedData = loadData();

// Put back the "previous totals" (and open the section if there are any)
if (savedData !== null && savedData.prev) {
  const p = savedData.prev;

  if (p.tnu > 0) {
    document.getElementById("prev-tnu").value = p.tnu;
  }
  if (p.tnup > 0) {
    document.getElementById("prev-tnup").value = p.tnup;
  }
  if (p.tcp > 0) {
    document.getElementById("prev-tcp").value = p.tcp;
  }
  if (p.tnu > 0 || p.tnup > 0 || p.tcp > 0) {
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

  // If the semester is still empty, start with one blank row
  if (getTbody(semId).children.length === 0) {
    addRow(semId);
  }
}

calculateAll();
