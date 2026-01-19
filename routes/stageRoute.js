import express from "express";
import * as C from "../controller/stageController.js";

const router = express.Router();

// ==============================
// STAGE
// ==============================
router.get("/getAllStage", C.getAllStage);
router.get("/getStageById/:id", C.getStageEvents);

router.get("/stage/:id", C.getStageById);
router.post("/stage", C.createStage);
router.put("/stage/:id", C.updateStage);
router.delete("/stage/:id", C.deleteStage);

// ==============================
// MAP UPLOAD (ใช้ middleware จาก controller)
// ==============================
router.post(
  "/stage/:id/map",
  C.uploadStageMapMiddleware,
  C.mapUploadErrorHandler,
  C.uploadStageMap
);

router.delete("/stage/:id/map", C.deleteStageMap);

// ==============================
// SPAWN
// ==============================
router.get("/spawn", C.getSpawns);
router.post("/spawn", C.createSpawn);
router.put("/spawn/:id", C.updateSpawn);
router.delete("/spawn/:id", C.deleteSpawn);

export default router;