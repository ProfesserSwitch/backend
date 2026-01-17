import express from 'express';
import pkg from "pg"; //connect to database
import bodyParser from "body-parser";

import playerRoutes from './routes/playerRoute.js';
import stageRoutes from './routes/stageRoute.js';
import dictRoutes from './routes/dictRoute.js';
import monsterRoute from './routes/monsterRoute.js';
import heroRoutes from './routes/heroRoute.js';

import cors from "cors"
import cookieParser from 'cookie-parser';

const {Pool} = pkg; // สร้างตัวแปร ของ PostgreSQL
const app = express();
const PORT = 3000;

app.use(bodyParser.json())

app.use(cors({
    origin:['http://localhost:5173','http://25.16.201.205:5173','http://26.23.130.235:5173'], //Domain ของ Frontend
    methods:['GET','POST','PUT','DELETE'], //Method ที่อนุญาต
    credentials:true, //ให้ส่งข้อมูล Header+Cookie ได้
    allowedHeaders: ["Content-Type", "Authorization"]
}))
// app.options("*", cors());

app.use("/img_hero",express.static("img_hero"))
app.use("/img_monster",express.static("img_monster"))
app.use("/img_map",express.static("img_map"))

app.use(cookieParser());

app.use(playerRoutes);
app.use(stageRoutes);
app.use(dictRoutes);
app.use(monsterRoute);
app.use(heroRoutes);

app.get('', async(req, res) => {
    res.send("Welcome to Hell");
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

