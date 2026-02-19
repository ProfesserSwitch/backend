import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ระบุชื่อไฟล์และ URL ของ API ฝั่ง Backend
const inputPath = path.join(__dirname, "final_with_oxford.txt"); 
// 💡 แก้ไข URL ให้ตรงกับ Router ที่คุณตั้งไว้คือ /dict
const API_URL = "http://localhost:3000/dict"; 

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

        console.log(`🚀 พบข้อมูลทั้งหมด ${total} รายการ กำลังเริ่มนำเข้าฐานข้อมูล...`);

        for (let i = 0; i < total; i++) {
            const line = lines[i].trim();
            const parts = line.split(";");
            
            // โครงสร้างไฟล์: word;type;level;meaning;is_oxford;
            const wordStr = parts[0]?.trim();
            const typeStr = parts[1]?.trim();
            const levelStr = parts[2]?.trim();
            const meaningStr = parts[3]?.trim();
            const isOxfordStr = parts[4]?.trim();

            // ป้องกันข้อมูลว่างเปล่า หรือคำที่ไม่มีคำแปล
            if (!wordStr || !meaningStr || meaningStr === "NOT_FOUND") {
                console.log(`⚠️ ข้ามบรรทัดที่ ${i + 1} (${wordStr}): ข้อมูลไม่ครบ หรือไม่มีคำแปล`);
                continue;
            }

            // จัดเตรียม Payload ให้ตรงกับ Data Type ในฐานข้อมูล
            const payload = {
                id: `${wordStr}_${typeStr}`,     // สร้าง ID ด้วย "คำศัพท์_ประเภทคำ" เพื่อรับประกันความ Unique และไม่เกิน 100 ตัวอักษร
                word: wordStr,
                type: typeStr,
                level: levelStr || "",           // ถ้าไม่มี Level ให้ส่งเป็น String ว่าง
                meaning: meaningStr,
                is_oxford: isOxfordStr === "true" // แปลงข้อความ "true" ให้เป็น Boolean true
            };

            try {
                // ยิง POST Request ไปที่ BackEnd
                const response = await axios.post(API_URL, payload);
                console.log(`✅ [${i + 1}/${total}] สำเร็จ: ${payload.word} (Oxford: ${payload.is_oxford})`);
                
            } catch (err) {
                // ส่วน Debug แจ้ง Error อย่างละเอียด
                if (err.response) {
                    console.error(`❌ [${i + 1}] ${payload.word} -> Server Error (${err.response.status}):`, err.response.data);
                    
                    // เพิ่มการแจ้งเตือนพิเศษเผื่อ Error เกิดจาก meaning ยาวเกินที่ฐานข้อมูลรับได้
                    if (payload.meaning.length > 255) {
                        console.error(`   👉 สาเหตุอาจเกิดจาก: ความหมายยาวเกิน (ยาว ${payload.meaning.length} ตัวอักษร)`);
                    }
                } else if (err.request) {
                    console.error(`❌ [${i + 1}] ${payload.word} -> ติดต่อ Server ไม่ได้ (เช็คว่าเปิด Port 3000 หรือยัง)`);
                } else {
                    console.error(`❌ [${i + 1}] ${payload.word} -> Error:`, err.message);
                }

                // หยุดรอ 2 วินาทีเพื่อให้คุณอ่าน Error ทัน
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Delay เล็กน้อย (30ms) เพื่อไม่ให้ Server ทำงานหนักหรือค้าง
            await new Promise(resolve => setTimeout(resolve, 30));
        }

        console.log(`\n🎉 ทำงานเสร็จสิ้น นำเข้าฐานข้อมูลเรียบร้อยทั้งหมด!`);

    } catch (err) {
        console.error("❌ เกิดข้อผิดพลาดร้ายแรงในสคริปต์:", err.message);
    }
}

postToDatabase();