// exportPages.js
const fs = require("fs");
const path = require("path");

const folderPath = path.join(__dirname, "src/pages"); // pages 경로
const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".tsx"));

files.forEach(file => {
    const content = fs.readFileSync(path.join(folderPath, file), "utf-8");
    console.log("----- FILE:", file, "-----\n");
    console.log(content);
    console.log("\n");
});
