import express from "express";
import * as C from "../controller/stageController.js";

const router = express.Router();

// ==============================
//  STAGE (/stage)
// ==============================
router.get("/stage/getAllStage", C.getAllStage);
router.get("/stage/getStageById/:id", C.getStageEvents);

// CRUD ใหม่
router.get("/stage/:id", C.getStageById);
router.post("/stage", C.createStage);
router.put("/stage/:id", C.updateStage);
router.delete("/stage/:id", C.deleteStage);

// ==============================
// SPAWN (/spawn)
// ==============================
router.get("/spawn", C.getSpawns);
router.post("/spawn", C.createSpawn);
router.put("/spawn/:id", C.updateSpawn);
router.delete("/spawn/:id", C.deleteSpawn);

export default router;
