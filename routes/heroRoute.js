import express from "express"
import * as heroC from "../controller/heroController.js"
const router = express.Router()


router.get('/hero',heroC.getHero)

export default router