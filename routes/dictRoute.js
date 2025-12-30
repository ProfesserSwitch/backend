import express from "express"
import * as dictC from "../controller/dictController.js"

const router = express.Router()

router.get("/dict", dictC.getDict); // เอาคำศัพท์ทั้งหมด
router.get("/dict/search/:word", dictC.searchDict); // ค้นหาคำศัพท์ที่ขึ้นต้นด้วยคำที่ระบุ
router.get("/dict/letter/:letter", dictC.getDictByLetter); // ดึงคำศัพท์ตามตัวอักษร
router.post("/dict/query", dictC.queryDict);

router.post("/dict", dictC.postDict); // เพิ่มคำศัพท์ใหม่
router.put("/dict/:word", dictC.updateDict); // แก้ไขคำศัพท์
router.delete("/dict/:word", dictC.deleteDict); // ลบคำศัพท์


export default router