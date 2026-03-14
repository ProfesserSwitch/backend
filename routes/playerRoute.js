import express from "express";
import * as playerC from "../controller/playerController.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

router.post("/register", playerC.register);
router.post("/login", playerC.login);
router.get("/logout", playerC.logout);
router.get("/checkAuth", authMiddleware, playerC.checkAuth);

router.get("/getplayer", playerC.getPlayer);
router.patch("/player-role", playerC.updatePlayerRole);

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
router.post(
  "/buy-hero", 
  authMiddleware, 
  playerC.buyHero
);
router.post(
  "/complete-stage",
  authMiddleware,
  playerC.unlockNextStage
);
router.post(
  "/update-money",
  authMiddleware,
  playerC.updateMoney
);
router.post(
  "/update-resources",
  authMiddleware,
  playerC.updateResources
);
router.post(
  "/level-up",
  authMiddleware,
  playerC.levelUpHero
);
router.post(
  "/preview-level-up",
  authMiddleware,
  playerC.previewLevelUp
);
router.post(
  "/update-stamina",
  authMiddleware,
  playerC.updateStamina
);
router.post(
  "/upgrade-potion-slot",
  authMiddleware,
  playerC.upgradePotionSlot
);
router.post(
  "/reduce-stamina-timer", 
  authMiddleware, 
  playerC.reduceStaminaTimer
);

export default router;