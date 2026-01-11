import express from "express";
import * as heroC from "../controller/heroController.js";
import { checkServerClose } from "../middlewares/checkServerClose.js";

const router = express.Router();

// CRUD
router.get("/hero", heroC.getHero);
router.post("/hero", checkServerClose, heroC.createHero);
router.put("/hero/:id", checkServerClose, heroC.updateHero);
router.delete("/hero/:id", checkServerClose, heroC.deleteHero);

// ✅ Sprites (8 รูป)
router.post("/hero/:id/sprites", checkServerClose, heroC.uploadHeroSprites);
router.delete("/hero/:id/sprites", checkServerClose, heroC.deleteHeroSprites);

export default router;