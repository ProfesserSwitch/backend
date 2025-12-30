import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const inputPath = path.join(__dirname, "word.txt");
const outputPath = path.join(__dirname, "crossword_dict.txt");

try {
    const data = fs.readFileSync(inputPath, "utf-8");
    const lines = data.split(/\r?\n/);
    const cleanedData = [];
    
    // ใช้ Set เพื่อจำคำที่เคยเก็บไปแล้ว
    const seenWords = new Set();
    const alphabetOnly = /^[a-zA-Z]+$/;

    lines.forEach((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;

        const parts = trimmedLine.split(";");
        const word = parts[0]?.trim();
        const type = parts[1]?.trim();
        const level = parts[2]?.trim();

        // เช็ค: 1. มีครบ 2. เป็นตัวอักษรล้วน 3. ยังไม่เคยเจอคำนี้มาก่อน
        if (word && type && level && alphabetOnly.test(word)) {
            const lowerWord = word.toLowerCase(); // ใช้ตัวพิมพ์เล็กเช็คซ้ำ
            if (!seenWords.has(lowerWord)) {
                seenWords.add(lowerWord);
                cleanedData.push(`${word};${type};${level};`);
            }
        }
    });

    fs.writeFileSync(outputPath, cleanedData.join("\n"), "utf-8");

    console.log(`-----------------------------------`);
    console.log(`✅ กรองสัญลักษณ์และตัดคำซ้ำเรียบร้อย!`);
    console.log(`📊 จำนวนที่เหลือ: ${cleanedData.length} คำ (จากเดิม 7,985)`);
    console.log(`📁 ไฟล์ผลลัพธ์: ${outputPath}`);
    console.log(`-----------------------------------`);

} catch (err) {
    console.error("❌ เกิดข้อผิดพลาด:", err.message);
}