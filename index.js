const { chromium } = require("playwright");
const XLSX = require("xlsx");
const fs = require("fs").promises;
const { parse } = require("csv-parse/sync");

function chunkify(arr, size, fillLast = false) {
  let result = [];
  let temp = [];
  for (const [idx, el] of Object.entries(arr)) {
    temp.push(el);
    if (temp.length === size || idx == arr.length - 1) {
      result.push(temp);
      temp = [];
    }
  }

  if (fillLast) {
    const last = result[result.length - 1];
    while (last.length < 3) {
      // manoucherie
      last.push("Ribes nigrum");
    }
  }

  return result;
}

function formatCellsContent(cells, plants) {
  let result = plants.reduce((acc, curr) => {
    return {
      ...acc,
      [curr]: {
        name: curr,
      },
    };
  }, {});

  let currentDimension = "";
  let currentPlantIdx = 0;
  for (let idx = 0; idx < cells.length; idx++) {
    const text = cells[idx];

    if (idx === 0 || !(idx % 4)) {
      currentDimension = text;
      continue;
    }

    const plantName = plants[currentPlantIdx];
    result[plantName][currentDimension] = text;

    if (currentPlantIdx !== plants.length - 1) {
      currentPlantIdx++;
    } else {
      currentPlantIdx = 0;
    }
  }

  return Object.values(result);
}

async function getPlantsInformation(chunk, page) {
  const input = page.locator("#A6");
  const button = page.locator("#A13");

  let activePlants = [];
  for (const plant of chunk) {
    await input.fill(plant);
    await button.click();
    activePlants.push(plant);
  }

  const cells = page.locator("//a[contains(@id, '-A17')]");
  const content = await cells.allTextContents();

  return formatCellsContent(content, activePlants);
}

function exportToExcel(data, fileName = "florif.xlsx") {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "florif");

  XLSX.writeFile(wb, fileName);
}

// pour import les plantes de ton drive
async function importPlants() {
  const buffer = await fs.readFile("./reeeee.csv");
  const data = parse(buffer);

  let result = [];

  // syntaxe pour plantName = data[idx][0]
  for (const [plantName] of data) {
    if (plantName.includes("subsp.") || plantName.includes("var.")) continue;
    const nameCleaned = plantName.split(" ").slice(0, 2).join(" ");
    result.push(nameCleaned);
  }

  return result.slice(1, result.length);
}

async function doesPlantExist(page, plantName) {
  let result = true;

  await page
    .locator(`.l-29 >> text=${plantName}`)
    .textContent()
    .catch((_) => (result = false));

  return { [plantName]: result };
}

async function getChunkInformation(page, chunk) {
  const input = page.locator("#A6");
  const button = page.locator("#A13");

  for (const plant of chunk) {
    await input.fill(plant);
    await button.click();
  }

  const result = await Promise.all(
    chunk.map((plant) => doesPlantExist(page, plant))
  );

  return result;
}

async function reloadComparePage(page) {
  await page.goto(
    "http://www.florif.fr/SITE_FLORIF/PAGE_SD_Comparaison/8BQAABdOfsZXbWxxcndGTVRvBgA"
  );
}

function exportPlants(parsed, browser) {
  const plantsWhichExist = parsed
    .filter((plant) => Object.values(plant)[0])
    .map((plant) => ({ name: Object.keys(plant)[0] }));

  exportToExcel(plantsWhichExist, `lol-test.xlsx`);
  browser.close();
}

function resumeScrapingFromExcel(filePath, chunks) {
  const read = XLSX.readFile(filePath);
  const data = XLSX.utils.sheet_to_json(read.Sheets.florif);

  const lastName = data.slice(-2)[0].name;

  const lastChunkIdx = chunks.findIndex((c) =>
    c.some((p) => p.includes(lastName))
  );

  return lastChunkIdx || 0;
}

// c'était pour tej les mauvais noms
async function getCleanPlantData() {
  const plantNames = await importPlants();
  const chunks = chunkify(plantNames, 3);

  const browser = await chromium.launch({
    headless: true,
  });

  const page = await browser.newPage();

  let result = [];
  let chunkNumber = 1;
  let flag = false;
  for (const [chunkIdx, chunk] of chunks.entries()) {
    await reloadComparePage(page).catch((_) => {
      exportPlants(result, browser);
      flag = true;
    });

    if (flag) return;

    const chunkInformation = await getChunkInformation(page, chunk);
    result = result.concat(chunkInformation);
    console.log((chunkNumber / chunks.length) * 100);
    chunkNumber++;
  }

  exportPlants(result, browser);
}

async function importPlantsFinal() {
  const buffer = await fs.readFile("./final.csv");
  //ptit problème d'encodage du csv il a ajouté des ;;; à la fin et le nom de la colonne
  const plantsNames = parse(buffer).map((subArr) => subArr[0].split(";")[0]);
  return plantsNames.slice(1, plantsNames.length);
}

async function finalScraper({ page, path, chunk }) {
  const url = `http://www.florif.fr/SITE_FLORIF/PAGE_SD_Comparaison/${path}`;
  await page.goto(url);

  return getPlantsInformation(chunk, page);
}

async function main() {
  const plants = await importPlantsFinal();
  const chunks = chunkify(plants, 3, true);

  const browser = await chromium.launch({
    headless: true,
  });
  const page = await browser.newPage();

  let result = [];
  for (const chunk of chunks) {
    // faut changer l'url de temps en temps pcq elle est dynamique cheloue
    const temp = await finalScraper({ chunk, page, path: "" }).catch((_) =>
      exportToExcel(result)
    );
    result = result.concat(temp);
  }
  exportToExcel(result);
  await browser.close();

  // pour filter les noms qui existent au début
  //getCleanPlantData();
}

main();
