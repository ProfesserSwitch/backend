import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. ระบุชื่อไฟล์และ URL ของ API
const inputPath = path.join(__dirname, "final_dict.txt"); 
const API_URL = "http://localhost:3000/postDict";

async function postToDatabase() {
    try {
        // เช็คว่ามีไฟล์ไหม
        if (!fs.existsSync(inputPath)) {
            console.error("❌ ไม่พบไฟล์: " + inputPath);
            return;
        }

        const data = fs.readFileSync(inputPath, "utf-8");
        const lines = data.split(/\r?\n/).filter(line => line.trim() !== "");
        const total = lines.length;

        console.log(`🚀 พบข้อมูลทั้งหมด ${total} รายการ กำลังเริ่มนำเข้า...`);

        for (let i = 0; i < total; i++) {
            const line = lines[i].trim();
            const parts = line.split(";");
            
            // โครงสร้างตามที่คุณให้มา: abandon;verb;B1;ละทิ้ง;
            // parts[0] = word, parts[1] = type, parts[2] = level, parts[3] = meaning
            const payload = {
                word: parts[0]?.trim(),
                type: parts[1]?.trim(),
                level: parts[2]?.trim(),
                meaning: parts[3]?.trim()
            };

            // ป้องกันข้อมูลว่างเปล่า
            if (!payload.word || !payload.meaning) {
                console.log(`⚠️ ข้ามบรรทัดที่ ${i + 1}: ข้อมูลไม่ครบ`);
                continue;
            }

            try {
                // ยิง Request ไปที่ BackEnd
                const response = await axios.post(API_URL, payload);
                console.log(`✅ [${i + 1}/${total}] สำเร็จ: ${payload.word}`);
                
            } catch (err) {
                // --- ส่วน Debug ที่จะบอกคุณว่าทำไมถึง Error ---
                if (err.response) {
                    // Server ตอบกลับมา (เช่น 400, 404, 500)
                    console.error(`❌ [${i + 1}] ${payload.word} -> Server Error (${err.response.status}):`, err.response.data);
                } else if (err.request) {
                    // ส่งไปหา Server ไม่เจอ (เช่น Port ผิด หรือไม่ได้เปิด Server)
                    console.error(`❌ [${i + 1}] ${payload.word} -> ติดต่อ Server ไม่ได้ (Check Port 3000)`);
                } else {
                    console.error(`❌ [${i + 1}] ${payload.word} -> Error:`, err.message);
                }

                // หยุดรอ 2 วินาทีเพื่อให้คุณอ่าน Error ทัน
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Delay เล็กน้อยเพื่อไม่ให้ Server ค้าง
            await new Promise(resolve => setTimeout(resolve, 30));
        }

        console.log(`\n🎉 ทำงานเสร็จสิ้น!`);

    } catch (err) {
        console.error("❌ เกิดข้อผิดพลาดร้ายแรงในสคริปต์:", err.message);
    }
}

postToDatabase();