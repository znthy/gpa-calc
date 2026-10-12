// ===== Import a course form (PDF or screenshot) =====
// Everything happens in the browser. The file is never uploaded anywhere.
//
// How it works:
//   PDF   -> read the text inside it (pdf.js). If it is a scan with no text, read it as a picture.
//   Image -> read the words in the picture (Tesseract.js, this is called OCR).
//   Then  -> look through the text line by line for course codes (like COS111) and units.
//
// The two reading libraries are only downloaded when you actually pick a file.
// We use "async" and "await" below: "await" means "wait here until this finishes".

const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

const fileInput = document.getElementById("form-file");
const statusBox = document.getElementById("import-status");
const reviewBox = document.getElementById("import-review");
const reviewList = document.getElementById("review-list");


// ----- SMALL HELPERS -----

// Show a message under the file box (red if it is an error)
function setStatus(text, isError) {
  statusBox.textContent = text;
  statusBox.classList.toggle("error", isError === true);
}

// Download a script from the internet once, and wait until it is ready
const loadedScripts = {};
function loadScript(url) {
  if (!loadedScripts[url]) {
    loadedScripts[url] = new Promise(function (resolve, reject) {
      const tag = document.createElement("script");
      tag.src = url;
      tag.onload = resolve;
      tag.onerror = function () {
        delete loadedScripts[url]; // so we can try again later
        reject(new Error("Could not download the reader. Check your internet connection."));
      };
      document.head.appendChild(tag);
    });
  }
  return loadedScripts[url];
}


// ----- FINDING COURSES IN TEXT -----

// Look through text and pick out course codes and their units.
// Returns a list like [{ code: "COS111", units: "3" }, ...]
function parseCourses(text) {
  const found = [];
  const seen = {};
  const lines = text.split("\n");

  // A course code is 2-4 letters then 3 digits, e.g. COS111 or "GST 112".
  // It can also have a school prefix like LASUED-GST114.
  const codePattern = /\b((?:[A-Z]{4,8}-)?[A-Z]{2,4})[\s-]?(\d{3})\b/;

  // Units are a single digit from 1 to 6 standing on its own, e.g. the 3 in "... Science 3 C"
  const unitPattern = /(?:^|[\s|])([1-6])(?=[\s|]|$)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toUpperCase();
    const match = line.match(codePattern);

    // No course code on this line, so move on to the next line
    if (match === null) {
      continue;
    }

    // Tidy the code: "GST 112" becomes "GST112"
    const code = match[1] + match[2];

    // Skip a code we have already found (for example a repeated header)
    if (seen[code]) {
      continue;
    }
    seen[code] = true;

    // Look only at the text AFTER the code. The units are the LAST single digit there,
    // because a title can contain a digit too (like "Mathematics 1").
    const rest = line.substring(match.index + match[0].length);
    let units = "";
    let m = unitPattern.exec(rest);
    while (m !== null) {
      units = m[1];
      m = unitPattern.exec(rest);
    }

    found.push({ code: code, units: units });
  }

  return found;
}


// ----- READING A PDF -----

// Turn one PDF page into a list of text lines, top to bottom
async function getPageLines(page) {
  const content = await page.getTextContent();

  // Keep only the pieces that really contain text
  const items = [];
  for (let i = 0; i < content.items.length; i++) {
    if (content.items[i].str.trim() !== "") {
      items.push(content.items[i]);
    }
  }

  // transform[4] is the x position and transform[5] is the y position.
  // Sort from the top of the page (biggest y) to the bottom.
  items.sort(function (a, b) {
    return b.transform[5] - a.transform[5];
  });

  // Pieces whose y is almost the same sit on the same line of the table
  const lines = [];
  for (let i = 0; i < items.length; i++) {
    const y = items[i].transform[5];
    const lastLine = lines[lines.length - 1];

    if (lastLine !== undefined && Math.abs(lastLine.y - y) <= 3) {
      lastLine.items.push(items[i]);
    } else {
      lines.push({ y: y, items: [items[i]] });
    }
  }

  // Put each line's pieces in left-to-right order and join them into one string
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    lines[i].items.sort(function (a, b) {
      return a.transform[4] - b.transform[4];
    });

    const pieces = [];
    for (let j = 0; j < lines[i].items.length; j++) {
      pieces.push(lines[i].items[j].str);
    }
    result.push(pieces.join(" "));
  }

  return result;
}

async function readPdf(file) {
  await loadScript(PDFJS_URL);
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: data }).promise;

  // Step 1: read the text that is inside the PDF
  setStatus("Reading the PDF...");
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const lines = await getPageLines(page);
    text = text + lines.join("\n") + "\n";
  }

  const courses = parseCourses(text);
  if (courses.length > 0) {
    return courses;
  }

  // Step 2: a scanned PDF has no text inside, so draw each page as a picture and read that
  setStatus("No text found, so reading the PDF as a picture. This is slower...");
  await loadScript(TESSERACT_URL);

  let pictureText = "";
  const pagesToRead = Math.min(pdf.numPages, 4);
  for (let p = 1; p <= pagesToRead; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 2 });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;

    const result = await Tesseract.recognize(canvas, "eng");
    pictureText = pictureText + result.data.text + "\n";
  }

  return parseCourses(pictureText);
}


// ----- READING AN IMAGE -----

async function readImage(file) {
  setStatus("Loading the image reader...");
  await loadScript(TESSERACT_URL);

  const result = await Tesseract.recognize(file, "eng", {
    logger: function (info) {
      if (info.status === "recognizing text") {
        setStatus("Reading the image... " + Math.round(info.progress * 100) + "%");
      }
    },
  });

  return parseCourses(result.data.text);
}


// ----- REVIEW BEFORE ADDING -----

// Show what was found so the user can fix mistakes before anything is added
function showReview(courses) {
  reviewList.innerHTML = "";

  if (courses.length === 0) {
    reviewBox.hidden = true;
    setStatus("No course codes found. Try a clearer screenshot or the PDF version.", true);
    return;
  }

  for (let i = 0; i < courses.length; i++) {
    const row = document.createElement("div");
    row.className = "review-row";

    row.innerHTML = `
      <input type="checkbox" class="pick" checked aria-label="Include this course">
      <input type="text" class="r-code" aria-label="Course code">
      <input type="number" class="r-units" min="1" max="10" placeholder="Units" inputmode="numeric" aria-label="Units">
    `;

    row.querySelector(".r-code").value = courses[i].code;
    row.querySelector(".r-units").value = courses[i].units;
    reviewList.appendChild(row);
  }

  reviewBox.hidden = false;
  setStatus("Found " + courses.length + " course(s). Check them below.");
}

// Remove courses that are completely empty from a semester
function removeBlankRows(semId) {
  const rows = getList(semId).querySelectorAll(".course");
  for (let i = 0; i < rows.length; i++) {
    const code = rows[i].querySelector(".code").value.trim();
    const score = rows[i].querySelector(".score").value.trim();
    const units = rows[i].querySelector(".units").value.trim();

    if (code === "" && score === "" && units === "") {
      rows[i].remove();
    }
  }
}

// The codes already in a semester (so we don't add the same course twice)
function getExistingCodes(semId) {
  const codes = [];
  const inputs = getList(semId).querySelectorAll(".code");
  for (let i = 0; i < inputs.length; i++) {
    codes.push(inputs[i].value.trim().toUpperCase());
  }
  return codes;
}


// ----- BUTTONS -----

// When a file is chosen: read it, then show the review
fileInput.addEventListener("change", async function () {
  const file = fileInput.files[0];
  if (!file) {
    return;
  }

  reviewBox.hidden = true;
  fileInput.disabled = true; // no second file while we are busy

  try {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");

    if (isPdf) {
      showReview(await readPdf(file));
    } else if (isImage) {
      showReview(await readImage(file));
    } else {
      setStatus("Please choose a PDF or an image.", true);
    }
  } catch (error) {
    setStatus("Something went wrong: " + error.message, true);
  }

  fileInput.disabled = false;
  fileInput.value = ""; // lets the same file be picked again
});

// "Add courses" button: put the ticked courses into the chosen semester
document.getElementById("import-add").addEventListener("click", function () {
  const semId = document.getElementById("import-target").value;
  const rows = reviewList.querySelectorAll(".review-row");

  removeBlankRows(semId);
  const existing = getExistingCodes(semId);

  let added = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].querySelector(".pick").checked) {
      continue;
    }

    const code = rows[i].querySelector(".r-code").value.trim().toUpperCase();
    const units = rows[i].querySelector(".r-units").value.trim();

    if (code === "") {
      continue;
    }
    if (existing.includes(code)) {
      skipped = skipped + 1;
      continue;
    }

    addRow(semId, code, "", units);
    existing.push(code);
    added = added + 1;
  }

  // Never leave a semester with no rows at all
  if (getList(semId).children.length === 0) {
    addRow(semId);
  }

  calculateAll();
  reviewBox.hidden = true;

  let message = added + " course(s) added. Now type in your scores.";
  if (skipped > 0) {
    message = message + " " + skipped + " skipped because they were already there.";
  }
  setStatus(message);

  document.getElementById(semId).scrollIntoView({ behavior: "smooth" });
});
