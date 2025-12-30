import express from "express"
import * as shopC from "../controller/shopController.js"

const router = express.Router()

router.get('/shop',shopC.getShop)
router.get('/searchShop/:name', shopC.searchShop)

export default router