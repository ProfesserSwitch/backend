import express from "express";
import * as playerHeroC from "../controller/playerHeroController.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// ⭐ เพิ่ม EXP / เลเวลอัป
router.post("/add-exp", authMiddleware, playerHeroC.addHeroExp);

// ⭐ ใช้แต้มอัปสเตตัส
router.post("/upgrade-stat", authMiddleware, playerHeroC.upgradeHeroStat);

export default router;
