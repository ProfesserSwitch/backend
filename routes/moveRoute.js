import express from "express"
import * as moveC from "../controller/moveController.js"

const router = express.Router()

router.get("/moves", moveC.getMoves);
router.get("/moves/:id", moveC.getMoveById);

router.post("/moves", moveC.postMove);
router.put("/moves/:id", moveC.updateMove);   
router.delete("/moves/:id", moveC.deleteMove); 

export default router