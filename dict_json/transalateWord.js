import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { translate } from 'google-translate-api-x';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, "crossword_dict.txt"); // ไฟล์ที่มี word;type;level;
const outputPath = path.join(__dirname, "final_dict.txt");

async function translateAndAppend() {
    try {
        const data = fs.readFileSync(inputPath, "utf-8");
        const lines = data.split(/\r?\n/).filter(l => l.trim());
        const total = lines.length;
        const result = [];
        const batchSize = 20; // ส่งไปแปลทีละ 20 คำเพื่อความเร็ว

        console.log(`เริ่มแปลทั้งหมด ${total} คำ...`);

        for (let i = 0; i < total; i += batchSize) {
            const currentBatch = lines.slice(i, i + batchSize);
            const wordsToTranslate = currentBatch.map(line => line.split(';')[0]);

            try {
                // แปลแบบกลุ่ม
                const res = await translate(wordsToTranslate, { from: 'en', to: 'th' });
                
                currentBatch.forEach((line, index) => {
                    const thaiMeaning = res[index].text;
                    // เอาบรรทัดเดิม (ที่มี word;type;level;) มาต่อด้วย คำแปล;
                    result.push(`${line}${thaiMeaning};`);
                });

                console.log(`✅ แปลแล้ว [${Math.min(i + batchSize, total)}/${total}]`);

                // พักนิดหน่อยป้องกันโดน Block
                await new Promise(r => setTimeout(r, 500));

            } catch (err) {
                console.error(`❌ ช่วงบรรทัดที่ ${i} มีปัญหา:`, err.message);
                // ถ้าพลาด ให้เก็บแบบไม่มีคำแปลไว้ก่อนไฟล์จะได้ไม่พัง
                currentBatch.forEach(line => result.push(`${line}ERROR;`));
            }

            // บันทึกความคืบหน้าทุกๆ 100 คำ
            if (i % 100 === 0) {
                fs.writeFileSync(outputPath, result.join('\n'), "utf-8");
            }
        }

        fs.writeFileSync(outputPath, result.join('\n'), "utf-8");
        console.log(`\n✨ เสร็จสมบูรณ์!`);
        console.log(`📁 ไฟล์ผลลัพธ์: ${outputPath}`);

    } catch (err) {
        console.error("❌ เกิดข้อผิดพลาดร้ายแรง:", err.message);
    }
}

translateAndAppend();