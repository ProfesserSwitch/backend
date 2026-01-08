import express from "express";
import * as monC from "../controller/monsterController.js";
import { checkServerClose } from "../middlewares/checkServerClose.js";

const router = express.Router();

router.get("/monster", monC.getMonster);

router.post("/monster", checkServerClose, monC.createMonster);
router.put("/monster/:id", checkServerClose, monC.updateMonster);
router.delete("/monster/:id", checkServerClose, monC.deleteMonster);

// ✅ อัปโหลด/แทนที่ sprites 4 รูป (ล็อคต้องครบ 4 รูป)
router.post("/monster/:id/sprites", checkServerClose, monC.uploadMonsterSprites);

// ✅ ลบ sprites ทั้งชุด 4 รูป
router.delete("/monster/:id/sprites", checkServerClose, monC.deleteMonsterSprites);

export default router;
