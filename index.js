import express from 'express';
import pkg from "pg"; //connect to database
import bodyParser from "body-parser";

import playerRoutes from './routes/playerRoute.js';
import stageRoutes from './routes/stageRoute.js';
import dictRoutes from './routes/dictRoute.js';
import shopRoutes from './routes/shopRoute.js';
import cors from "cors"
import cookieParser from 'cookie-parser';

const {Pool} = pkg; // สร้างตัวแปร ของ PostgreSQL
const app = express();
const PORT = 3000;

app.use(bodyParser.json())

app.use(cors({
    origin:['http://localhost:5173','http://25.16.201.205:5173','http://26.23.130.235:5173'], //Domain ของ Frontend
    methods:['GET','POST','PUT','DELETE'], //Method ที่อนุญาต
    credentials:true  //ให้ส่งข้อมูล Header+Cookie ได้
}))

app.use(cookieParser());

// เชื่อมต่อกับ Database Server
const database = new Pool({
  connectionString:`postgres://dev:${encodeURIComponent('8264')}@127.0.0.1:5432/WordGame`
});

app.use(playerRoutes);
app.use(stageRoutes);
app.use(dictRoutes);
app.use(shopRoutes);

//เรียกใช้โหลเดอร์รูปภาพ
app.use("/asset", express.static("asset"));

app.get('', async(req, res) => {
    console.log("Hello World E NA TAD");
    res.send("Hello World E NA TAD");
});

app.get('/monsters', async(req, res) => {
    try {
        const strQry ='SELECT * FROM monster';
        const result = await database.query(strQry)
        return res.status(200).json(result.rows)
    }
    catch(error) {
        return res.status(500).json({message: error.message})
    }
});

app.get('/Items', async(req, res) => {
    try {
        console.log("ทำไมไม่ขึ้น")
        const strQry ='SELECT * FROM Items';
        const result = await database.query(strQry)
        return res.status(200).json(result.rows)
    }
    catch(error) {
        return res.status(500).json({message: error.message})
    }
});



app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

