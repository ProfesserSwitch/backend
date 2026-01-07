import database from "../service/database.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export async function register(req, res) {
  console.log(`POST /player`);

  try {
    const { username, email, password } = req.body;

    // validate
    if (!username || !email || !password) {
      console.log("Invalid data");
      return res.status(400).json({
        isSuccess: false,
        message: "invalid data",
      });
    }

    // check username
    const existsUsername = await database.query(
      `SELECT EXISTS (SELECT 1 FROM player WHERE username = $1)`,
      [username]
    );

    if (existsUsername.rows[0].exists) {
      console.log("Username already exists");
      return res.json({
        isSuccess: false,
        message: `username ${username} already exists`,
      });
    }

    // check email
    const existsEmail = await database.query(
      `SELECT EXISTS (SELECT 1 FROM player WHERE email = $1)`,
      [email]
    );

    if (existsEmail.rows[0].exists) {
      console.log("Email already exists");
      return res.json({
        isSuccess: false,
        message: `email ${email} already exists`,
      });
    }

    // hash password
    const saltRounds = 11;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await database.query(
      `
      INSERT INTO player (username, password_hash, email, role)
      VALUES ($1, $2, $3, $4)
      RETURNING username, email, role, created_at
      `,
      [username, passwordHash, email, 'player'] // ส่งค่า 'player' เข้าไปเป็น $4
    );

    console.log("Player registered successfully");
    // ส่งเฉพาะข้อมูลที่ควรส่ง
    return res.json({
      isSuccess: true,
      message: "server error",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      isSuccess: false,
      message: "server error",
    });
  }
}
// export async function login(req, res) {
//   console.log(`POST / login is Requested`);
//   try {
//     console.log(req.body);
//     //not null
//     if (req.body.username == null || req.body.password == null) {
//       // return res.status(422).json({
//       //   error: "Email and Name is required",
//       // });
//       return res.json({
//         isSuccess: false,
//         message: "invalid data",
//       });
//     }

//     const existsResult = await database.query({
//       text: `SELECT EXISTS (SELECT * FROM player p WHERE p."username" = $1)`,
//       values: [req.body.username],
//     });

//     if (!existsResult.rows[0].exists) {
//       // return res.status(400).json({
//       //   messagelogin:`Login Fail!!`
//       // });
//       return res.json({
//         isSuccess: false,
//         message: "not found username",
//       });
//     }

//     const result = await database.query({
//       text: `SELECT * FROM player p WHERE p."username" = $1`,
//       values: [req.body.username],
//     });

//     // เอา password ไปเช็คกับ memHash
//     const loginok = await bcrypt.compare(
//       req.body.password,
//       result.rows[0].password_hash
//     );
//     if (loginok) {
//       // res.status(201).json({messagelogin:'Login Success'})
//       const theuser = {
//         username: result.rows[0].username,
//         dutyId: result.rows[0].dutyId,
//       };

//       const secret_key = "ImGroot"; //อ่านค่าจากfile .env
//       const token = jwt.sign(theuser, secret_key, { expiresIn: "1h" });

//       // // สร้าง Cookie
//       // res.cookie('token',token,{
//       //     httpOnly:true, //ไม่ให้ client แก้ไขค่าได้
//       //     maxAge:3600000, //กำหนดอายุของ Cookie เป็น ms 3600000->60minute
//       //     secure:false, //กำหนด Security
//       //     sameSite:"lax" //บังคับให้ส่งใน Site เดียวกันหรือไม่
//       // })
//       res.json({
//         isSuccess: true,
//         token: token,
//         message: "login successful",
//         user: theuser,
//       });
//     } else {
//       res.clearCookie("token", {
//         secure: false,
//         sameSite: "lax",
//       });
//       res.json({
//         isSuccess: false,
//         message: "invalid password",
//       });
//     }
//   } catch (err) {
//     return res.json({
//       isSuccess: false,
//       message: "error",
//     });
//   }
// }

// export async function logout(req, res) {
//   console.log(`GET /logoutMembers is requested`);
//   try {
//     res.clearCookie("token", {
//       secure: false,
//       sameSite: "lax",
//     });
//     return res.json({ isSuccess: false });
//   } catch (err) {
//     return res.json({ isSuccess: true });
//   }
// }

export async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json({ isSuccess: false, message: "invalid data" });
    }

    const result = await database.query({
      text: `SELECT * FROM player WHERE username = $1`,
      values: [username],
    });

    if (result.rowCount === 0) {
      return res.json({ isSuccess: false, message: "not found username" });
    }

    const userRow = result.rows[0];
    const loginok = await bcrypt.compare(password, userRow.password_hash);

    if (!loginok) {
      return res.json({ isSuccess: false, message: "invalid password" });
    }

    const theuser = {
      username: userRow.username,
      role: userRow.role,
      dutyId: userRow.dutyId,
    };

    const token = jwt.sign(theuser, "ImGroot", { expiresIn: "1h" });

    return res.json({
      isSuccess: true,
      token,        // ⭐ สำคัญ
      user: theuser // ⭐ สำคัญ
    });
  } catch (err) {
    return res.status(500).json({ isSuccess: false, message: "error" });
  }
}
export async function logout(req, res) {
  return res.json({ isSuccess: true });
}

// ตรวจสอบสถานะการล็อกอิน ว่า ยังล็อกอินอยู่ไหม
export async function checkAuth(req, res) {
  return res.json({
      isSuccess: true,
      user: req.user,
    });
}

export async function getPlayer(req, res) {
  console.log(`GET / Player is Requested`);
  try {
    const result = await database.query("SELECT * FROM player");
    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

