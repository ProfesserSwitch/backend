import express from "express";
import * as playerC from "../controller/playerController.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

router.post("/register", playerC.register);
router.post("/login", playerC.login);
router.get("/logout", playerC.logout);
router.get("/checkAuth", authMiddleware, playerC.checkAuth);

router.get("/getplayer", playerC.getPlayer);

// ⭐⭐ เพิ่มอันนี้ ⭐⭐
router.get(
  "/checkFirstTime",
  authMiddleware,
  playerC.checkFirstTime
);


router.post(
  "/select-hero",
  authMiddleware,
  playerC.selectHero
);


export default router;
