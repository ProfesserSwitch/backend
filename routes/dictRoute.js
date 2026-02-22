import express from "express";
import * as dictC from "../controller/dictController.js";

const router = express.Router();

router.get("/dict", dictC.getDict);
router.get("/dict/search/:word", dictC.searchDict);
router.get("/dict/letter/:letter", dictC.getDictByLetter);
router.post("/dict/query", dictC.queryDict);

router.post("/dict", dictC.postDict);

// ✅ เปลี่ยนจาก :word -> :id
router.put("/dict/:id", dictC.updateDict);
router.delete("/dict/:id", dictC.deleteDict);

/** =================================================
 * 🔥 NEW: Dictionary Sentence Routes
 * ================================================= */

// ✅ เพิ่มประโยค
router.post("/dict/sentence", dictC.postDictionarySentence);

// ✅ ดึงประโยคตาม word_id
router.get("/dict/sentence/:word_id", dictC.getSentencesByWordId);

// ✅ ลบประโยค
router.delete("/dict/sentence/:id", dictC.deleteDictionarySentence);

export default router;