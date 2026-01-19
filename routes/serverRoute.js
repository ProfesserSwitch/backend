import express from "express";
import * as serverC from "../controller/serverController.js";

const router = express.Router();

router.get("/server/:id", serverC.getServerById);
router.patch("/server/:id/toggle", serverC.toggleServer);

export default router;