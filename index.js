const { chromium } = require("playwright");
const XLSX = require("xlsx");

const plants = [
  "Acer campestre",
  "Acer negundo",
  "Ribes alpinum",
  "Ribes rubrum",
];

function chunkify(arr, size) {
  let result = [];
  let temp = [];
  for (const [idx, el] of Object.entries(arr)) {
    temp.push(el);
    if (temp.length === size || idx == arr.length - 1) {
      result.push(temp);
      temp = [];
    }
  }

  const last = result[result.length - 1];
  while (last.length < 3) {
    last.push("Ribes nigrum");
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

function exportToExcel(data) {
  const fileName = "florif.xlsx";

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "florif");

  XLSX.writeFile(wb, fileName);
}

async function main() {
  const chunks = chunkify(plants, 3);

  const browser = await chromium.launch({
    headless: true,
  });

  const page = await browser.newPage();

  let result = [];
  for (const chunk of chunks) {
    // faut changer l'url de temps en temps pcq elle est dynamique cheloue
    await page.goto(
      "http://www.florif.fr/SITE_FLORIF/PAGE_SD_Comparaison/IyIAAGGV9Yh1Qk1ldXlzZ3RnAAA?A5"
    );

    const plants = await getPlantsInformation(chunk, page);
    result = [...result, ...plants];
  }

  exportToExcel(result);
  await browser.close();
}

main();
