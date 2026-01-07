import express from "express"
import * as monC from "../controller/monsterController.js"
import { checkServerClose } from "../middlewares/checkServerClose.js";

const router = express.Router()

router.get("/monster", monC.getMonster);

router.post("/monster", checkServerClose, monC.createMonster);
router.put("/monster/:id", checkServerClose, monC.updateMonster);
router.delete("/monster/:id", checkServerClose, monC.deleteMonster);

export default router