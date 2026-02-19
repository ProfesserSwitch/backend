import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. ระบุไฟล์ต้นทางและปลายทาง
const oxfordPath = path.join(__dirname, "oxford.txt"); 
const inputDictPath = path.join(__dirname, "lexitron_filtered.txt"); // ไฟล์ที่คุณกรองมาจาก Lexitron
const outputPath = path.join(__dirname, "final_with_oxford.txt"); // ไฟล์ผลลัพธ์ใหม่

// ฟังก์ชันสำหรับแกะข้อมูล Oxford ที่ซับซ้อน
function parseOxfordLine(line) {
    // แยกคำศัพท์กับส่วนที่เป็น Type/Level ออกจากกัน
    const match = line.trim().match(/^([a-zA-Z-]+)\s+(.*)$/);
    if (!match) return [];
    
    const word = match[1].toLowerCase();
    const posLevelStr = match[2];

    const chunks = posLevelStr.split(',');
    const results = [];
    let pendingPos = []; // เก็บ type ที่ยังไม่มี level ต่อท้าย (เช่น prep. ใน prep., adv. A1)

    // ตัวแปลงประเภทคำจาก Oxford ให้ตรงกับระบบของเรา
    const posMappings = {
        'v.': 'verb',
        'n.': 'noun',
        'adj.': 'adjective',
        'adv.': 'adverb',
        'prep.': 'preposition',
        'conj.': 'conjunction',
        'pron.': 'pronoun'
    };

    chunks.forEach(chunk => {
        // หา Level (A1 ถึง C2)
        const levelMatch = chunk.match(/(A1|A2|B1|B2|C1|C2)/);
        const level = levelMatch ? levelMatch[1] : null;

        // หาประเภทคำใน chunk นั้นๆ
        let foundPos = [];
        for (const [key, val] of Object.entries(posMappings)) {
            if (chunk.includes(key)) foundPos.push(val);
        }

        if (level) {
            // ถ้ามี Level ให้จับคู่กับ Type ที่เพิ่งหาเจอ
            foundPos.forEach(p => results.push({ word, type: p, level }));
            // และเอา Level นี้ไปใช้กับ Type ที่ค้างอยู่ก่อนหน้าด้วย
            pendingPos.forEach(p => results.push({ word, type: p, level }));
            pendingPos = []; // เคลียร์ของที่ค้าง
        } else {
            // ถ้าไม่มี Level แปลว่ามันแชร์ Level กับตัวข้างหลัง ให้เก็บรอไว้ก่อน
            pendingPos.push(...foundPos);
        }
    });

    return results;
}

try {
    // 2. อ่านไฟล์ Oxford และสร้างฐานข้อมูลใน Memory
    console.log("กำลังอ่านและแปลงรูปแบบข้อมูลจาก oxford.txt...");
    const oxfordData = fs.readFileSync(oxfordPath, "utf-8");
    const oxfordLines = oxfordData.split(/\r?\n/).filter(line => line.trim() !== "");
    
    const oxfordMap = new Map();
    let oxfordWordCount = 0;

    oxfordLines.forEach(line => {
        const parsedItems = parseOxfordLine(line);
        parsedItems.forEach(item => {
            const key = `${item.word}_${item.type}`;
            oxfordMap.set(key, item.level);
            oxfordWordCount++;
        });
    });

    console.log(`✅ โหลดข้อมูล Oxford สำเร็จ! แตกย่อยได้ ${oxfordWordCount} รายการ (Word + Type)`);

    // 3. อ่านไฟล์ดิกชันนารีของเราเพื่อนำมาเช็ค
    console.log("กำลังนำข้อมูลมาเทียบกับไฟล์ lexitron_filtered.txt...");
    if (!fs.existsSync(inputDictPath)) {
        throw new Error(`ไม่พบไฟล์ ${inputDictPath} กรุณาตรวจสอบชื่อไฟล์ครับ`);
    }

    const myDictData = fs.readFileSync(inputDictPath, "utf-8");
    const myDictLines = myDictData.split(/\r?\n/).filter(line => line.trim() !== "");

    const outputLines = [];
    let matchCount = 0;

    myDictLines.forEach(line => {
        const parts = line.split(";");
        const word = parts[0]?.trim();
        const type = parts[1]?.trim();
        // parts[2] คือ level เดิม (ซึ่งว่างอยู่)
        const meaning = parts[3]?.trim();

        const key = `${word}_${type}`;
        
        let finalLevel = "";
        let isOxford = "false";

        // เช็คว่ามีใน Oxford ไหม
        if (oxfordMap.has(key)) {
            finalLevel = oxfordMap.get(key);
            isOxford = "true";
            matchCount++;
        }

        // จัดรูปแบบใหม่: word;type;level;meaning;is_oxford;
        outputLines.push(`${word};${type};${finalLevel};${meaning};${isOxford};`);
    });

    // 4. บันทึกเป็นไฟล์ใหม่
    fs.writeFileSync(outputPath, outputLines.join("\n"), "utf-8");

    console.log(`-----------------------------------`);
    console.log(`✅ นำข้อมูล Oxford มาอัปเดตเรียบร้อย!`);
    console.log(`🎯 มีคำศัพท์ที่ตรงกับ Oxford และได้อัปเดต Level จำนวน: ${matchCount} รายการ`);
    console.log(`📁 ไฟล์ผลลัพธ์ใหม่พร้อมใช้งาน: ${outputPath}`);
    console.log(`-----------------------------------`);

} catch (err) {
    console.error("❌ เกิดข้อผิดพลาด:", err.message);
}