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
      INSERT INTO player (username, password_hash, email, role, money)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING username, email, role, money, created_at
      `,
      [username, passwordHash, email, 'player', 0] 
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
export async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json({ isSuccess: false, message: "invalid data" });
    }

    const result = await database.query(
      `SELECT * FROM player WHERE username = $1`,
      [username]
    );

    if (result.rowCount === 0) {
      return res.json({ isSuccess: false, message: "not found username" });
    }

    const userRow = result.rows[0];
    const loginok = await bcrypt.compare(password, userRow.password_hash);

    if (!loginok) {
      return res.json({ isSuccess: false, message: "invalid password" });
    }

    // ⭐ ดึง hero ของผู้เล่น
    const heroResult = await database.query(
      `
      SELECT *
      FROM player_hero
      WHERE player_id = $1
      ORDER BY hero_id ASC
      `,
      [userRow.username]
    );

    const theuser = {
      username: userRow.username,
      role: userRow.role,
      money: userRow.money,
      dutyId: userRow.dutyId,
      // ⭐ hero ทั้งหมด
      heroes: heroResult.rows,
    };

    const token = jwt.sign(
      {
        username: theuser.username,
        role: theuser.role,
      },
      "ImGroot",
      { expiresIn: "1h" }
    );

    return res.json({
      isSuccess: true,
      token,
      user: theuser,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ isSuccess: false, message: "error" });
  }
}

export async function logout(req, res) {
  return res.json({ isSuccess: true });
}

// ตรวจสอบสถานะการล็อกอิน ว่า ยังล็อกอินอยู่ไหม
export async function checkAuth(req, res) {
  try {
    const username = req.user.username;

    // 🔹 ดึง player
    const playerResult = await database.query(
      `SELECT username, role, money FROM player WHERE username = $1`,
      [username]
    );

    if (playerResult.rowCount === 0) {
      return res.status(401).json({ isSuccess: false });
    }

    // 🔹 ดึง hero ของผู้เล่น
    const heroResult = await database.query(
      `
      SELECT *
      FROM player_hero
      WHERE player_id = $1
      ORDER BY hero_id ASC
      `,
      [username]
    );

    return res.json({
      isSuccess: true,
      user: {
        ...playerResult.rows[0],
        heroes: heroResult.rows,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ isSuccess: false });
  }
}


export async function checkFirstTime(req, res) {
  try {
    console.log("decoded user:", req.user);

    const username = req.user?.username;
    if (!username) {
      return res.status(400).json({
        isSuccess: false,
        message: "invalid token payload",
      });
    }

    const result = await database.query(
      `
      SELECT 1
      FROM player_hero
      WHERE player_id = $1
      LIMIT 1
      `,
      [username]
    );

    return res.json({
      isSuccess: true,
      firstTime: result.rowCount === 0,
    });
  } catch (error) {
    console.error("checkFirstTime error:", error);
    return res.status(500).json({
      isSuccess: false,
      message: "server error",
    });
  }
}


export async function selectHero(req, res) {
  const client = await database.connect();

  try {
    const username = req.user.username;
    const { heroId } = req.body;

    if (!heroId) {
      return res.status(400).json({ isSuccess: false });
    }

    await client.query("BEGIN");

    // 1️⃣ ปิด hero ตัวเดิมทั้งหมด
    await client.query(
      `
      UPDATE player_hero
      SET is_selected = false
      WHERE player_id = $1
      `,
      [username]
    );

    // 2️⃣ เปิด hero ตัวใหม่
    const result = await client.query(
      `
      UPDATE player_hero
      SET is_selected = true
      WHERE player_id = $1 AND hero_id = $2
      RETURNING *
      `,
      [username, heroId]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        isSuccess: false,
        message: "hero not owned",
      });
    }

    await client.query("COMMIT");

    return res.json({
      isSuccess: true,
      selectedHero: result.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ isSuccess: false });
  } finally {
    client.release();
  }
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

