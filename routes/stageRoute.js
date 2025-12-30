import express from "express"
import * as stageC from "../controller/stageController.js"

const router = express.Router()

router.get('/getAllStage',stageC.getAllStage)
router.get('/getStageById/:id',stageC.getStageEvents)

export default router