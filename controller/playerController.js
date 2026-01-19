import database from "../service/database.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export async function register(req, res) {
  console.log("POST /player");
  const client = await database.connect();

  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        isSuccess: false,
        message: "invalid data",
      });
    }

    // check username
    const checkUser = await client.query(
      `SELECT 1 FROM player WHERE username = $1`,
      [username]
    );
    if (checkUser.rowCount > 0) {
      return res.json({
        isSuccess: false,
        message: "username already exists",
      });
    }

    // check email
    const checkEmail = await client.query(
      `SELECT 1 FROM player WHERE email = $1`,
      [email]
    );
    if (checkEmail.rowCount > 0) {
      return res.json({
        isSuccess: false,
        message: "email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 11);

    await client.query("BEGIN");

    // 1️⃣ insert player
    const playerResult = await client.query(
      `
      INSERT INTO player (username, password_hash, email, role, money)
      VALUES ($1, $2, $3, 'player', 0)
      RETURNING username, email, role, money, created_at
      `,
      [username, passwordHash, email]
    );

    // 2️⃣ insert stage progress (เริ่มด่านแรก)
    await client.query(
      `
      INSERT INTO player_stage_progress
      (player_id, stage_id, last_distant, is_completed, is_current)
      VALUES ($1, 'green-grass-1', 0, false, true)
      `,
      [username]
    );

    // 3️⃣ ดึง hero เริ่มต้น (chara)
    const heroResult = await client.query(
      `
      SELECT *
      FROM hero
      WHERE id = $1
      `,
      ["chara"]
    );

    if (heroResult.rowCount === 0) {
      throw new Error("hero chara not found");
    }

    const hero = heroResult.rows[0];

    // 4️⃣ insert hero ให้ผู้เล่น
    await client.query(
      `
      INSERT INTO player_hero
      (
        player_id,
        hero_id,
        level,
        next_exp,
        is_selected
      )
      VALUES
      (
        $1, $2,
        1,
        100,
        true
      )
      `,
      [
        username,
        hero.id,
      ]
    );

    await client.query("COMMIT");

    return res.json({
      isSuccess: true,
      message: "register success",
      data: playerResult.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("register error:", err);
    return res.status(500).json({
      isSuccess: false,
      message: "server error",
    });
  } finally {
    client.release();
  }
}

export async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json({ isSuccess: false, message: "invalid data" });
    }

    // 1️⃣ player
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

    // 2️⃣ hero ของผู้เล่น + base stat (ระบบใหม่)
    const heroResult = await database.query(
      `
      SELECT 
        ph.id AS player_hero_id,
        ph.hero_id,
        ph.level,
        ph.next_exp,
        ph.is_selected,

        h.name,
        h.description,
        h.hp_lv,
        h.power_lv,
        h.speed_lv,
        h.slot_lv,
        h.spin_point

      FROM player_hero ph
      JOIN hero h ON ph.hero_id = h.id
      WHERE ph.player_id = $1
      ORDER BY ph.hero_id ASC
      `,
      [userRow.username]
    );

    // 3️⃣ stage progress
    const stageResult = await database.query(
      `
      SELECT *
      FROM player_stage_progress
      WHERE player_id = $1
      ORDER BY stage_id ASC
      `,
      [userRow.username]
    );

    const theuser = {
      username: userRow.username,
      role: userRow.role,
      money: userRow.money,
      dutyId: userRow.dutyId,
      heroes: heroResult.rows,
      stages: stageResult.rows,
    };

    const token = jwt.sign(
      {
        username: theuser.username,
        role: theuser.role,
      },
      "ImGroot",
      { expiresIn: "7h" }
    );

    return res.json({
      isSuccess: true,
      token,
      user: theuser,
    });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ isSuccess: false, message: "error" });
  }
}


export async function logout(req, res) {
  return res.json({ isSuccess: true });
}

export async function checkAuth(req, res) {
  try {
    const username = req.user.username;

    // 1️⃣ player
    const result = await database.query(
      `SELECT * FROM player WHERE username = $1`,
      [username]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ isSuccess: false });
    }

    const userRow = result.rows[0];

    // 2️⃣ hero ของผู้เล่น + base stat (ระบบใหม่)
    const heroResult = await database.query(
      `
      SELECT 
        ph.id AS player_hero_id,
        ph.hero_id,
        ph.level,
        ph.is_selected,

        h.name,
        h.description,
        h.hp_lv,
        h.power_lv,
        h.speed_lv,
        h.slot_lv,
        h.spin_point

      FROM player_hero ph
      JOIN hero h ON ph.hero_id = h.id
      WHERE ph.player_id = $1
      ORDER BY ph.hero_id ASC
      `,
      [userRow.username]
    );

    // 3️⃣ stage progress
    const stageResult = await database.query(
      `
      SELECT *
      FROM player_stage_progress
      WHERE player_id = $1
      ORDER BY stage_id ASC
      `,
      [userRow.username]
    );

    const theuser = {
      username: userRow.username,
      role: userRow.role,
      money: userRow.money,
      dutyId: userRow.dutyId,
      heroes: heroResult.rows,
      stages: stageResult.rows,
    };

    return res.json({
      isSuccess: true,
      user: theuser,
    });
  } catch (err) {
    console.error("checkAuth error:", err);
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

export async function buyHero(req, res) {
  const client = await database.connect();
  try {
    const username = req.user.username;
    const { heroId } = req.body;

    await client.query("BEGIN");

    // 1️⃣ hero master
    const heroResult = await client.query(
      `SELECT * FROM hero WHERE id = $1`,
      [heroId]
    );
    if (heroResult.rowCount === 0) {
      throw new Error("hero not found");
    }

    const hero = heroResult.rows[0];

    // 2️⃣ already owned?
    const owned = await client.query(
      `SELECT 1 FROM player_hero WHERE player_id = $1 AND hero_id = $2`,
      [username, heroId]
    );
    if (owned.rowCount > 0) {
      return res.json({ isSuccess: false, message: "hero already owned" });
    }

    // 3️⃣ check money
    const playerResult = await client.query(
      `SELECT money FROM player WHERE username = $1`,
      [username]
    );
    const money = playerResult.rows[0].money;

    if (money < hero.price) {
      return res.json({ isSuccess: false, message: "not enough money" });
    }

    // 4️⃣ deduct money
    await client.query(
      `UPDATE player SET money = money - $1 WHERE username = $2`,
      [hero.price, username]
    );

    // 5️⃣ insert hero
    const newHero = await client.query(
      `
      INSERT INTO player_hero (
        player_id, hero_id,
        level, next_exp, is_selected
      )
      VALUES (
        $1, $2,
        1,0,100,false
      )
      RETURNING *
      `,
      [
        username,
        hero.id,
      ]
    );

    await client.query("COMMIT");

    return res.json({
      isSuccess: true,
      hero: newHero.rows[0],
      moneyLeft: money - hero.price,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ isSuccess: false });
  } finally {
    client.release();
  }
}

export async function unlockNextStage(req, res) {
  const { currentStageId } = req.body;
  const username = req.user.username; 

  console.log(`POST / Unlock Next Stage for: ${username}, Current: ${currentStageId}`);

  if (!currentStageId) {
    return res.status(400).json({ isSuccess: false, message: "Missing currentStageId" });
  }

  const client = await database.connect();

  try {
    await client.query("BEGIN");

    // ---------------------------------------------------------
    // 1. ⭐ เช็คสถานะด่านปัจจุบันก่อนเลย ⭐
    // ---------------------------------------------------------
    const checkProgress = await client.query(
      `SELECT is_completed FROM player_stage_progress WHERE player_id = $1 AND stage_id = $2`,
      [username, currentStageId]
    );

    if (checkProgress.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ isSuccess: false, message: "Stage progress not found" });
    }

    const isAlreadyCompleted = checkProgress.rows[0].is_completed;

    // 🛑 CASE: เล่นซ้ำ (เคยผ่านไปแล้ว) -> จบการทำงานเลย
    if (isAlreadyCompleted) {
      console.log(`User ${username} replayed stage ${currentStageId}. Nothing updated.`);
      await client.query("COMMIT");
      return res.json({
        isSuccess: true,
        message: "Stage completed (Replay).",
        newUnlock: false
      });
    }

    // ---------------------------------------------------------
    // 2. CASE: ผ่านครั้งแรก (First Clear) -> เริ่มกระบวนการปลดล็อค
    // ---------------------------------------------------------

    // 2.1 อัปเดตด่านปัจจุบัน: ผ่านแล้ว (is_completed=true) และไม่ใช่ด่านปัจจุบันแล้ว (is_current=false)
    await client.query(
      `
      UPDATE player_stage_progress
      SET is_completed = true, is_current = false
      WHERE player_id = $1 AND stage_id = $2
      `,
      [username, currentStageId]
    );

    // 2.2 หาด่านถัดไป (Next Stage)
    const findNextStageQuery = `
      SELECT s2.id AS next_stage_id, s2.name AS next_stage_name
      FROM stage s1
      JOIN stage s2 ON s2."orderNo" = s1."orderNo" + 1
      WHERE s1.id = $1
    `;
    const nextStageResult = await client.query(findNextStageQuery, [currentStageId]);
    const nextStage = nextStageResult.rows[0];

    // 2.3 ถ้ามีด่านถัดไป -> Insert ลง progress
    if (nextStage) {
      await client.query(
        `
        INSERT INTO player_stage_progress 
        (player_id, stage_id, last_distant, is_completed, is_current)
        VALUES ($1, $2, 0, false, true)
        `,
        [username, nextStage.next_stage_id]
      );
    }

    await client.query("COMMIT");

    return res.json({
      isSuccess: true,
      message: nextStage 
        ? `Stage completed! Unlocked: ${nextStage.next_stage_name}` 
        : "Congratulations! All stages completed.",
      newUnlock: true,
      nextStage: nextStage
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("unlockNextStage error:", error);
    return res.status(500).json({ 
      isSuccess: false, 
      message: error.message 
    });
  } finally {
    client.release();
  }
}

export async function updateMoney(req, res) {
  const { money } = req.body; // รับค่าเงินที่จะ Set จาก body
  const username = req.user.username; // รับจาก Token

  console.log(`POST / Update Money for: ${username} to: ${money}`);

  // เช็คว่าส่งค่ามาไหม (เช็ค undefined เพราะเงินอาจจะเป็น 0 ได้)
  if (money === undefined || money === null) {
    return res.status(400).json({ 
      isSuccess: false, 
      message: "Please provide 'money' value." 
    });
  }

  try {
    // ใช้คำสั่ง UPDATE ... SET money = $1 เลย (ไม่ใช่การบวกเพิ่ม)
    const result = await database.query(
      `
      UPDATE player 
      SET money = $1 
      WHERE username = $2
      RETURNING money
      `,
      [money, username]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ isSuccess: false, message: "Player not found" });
    }

    return res.json({
      isSuccess: true,
      message: "Money updated successfully",
      currentMoney: result.rows[0].money
    });

  } catch (error) {
    console.error("updateMoney error:", error);
    return res.status(500).json({ 
      isSuccess: false, 
      message: error.message 
    });
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

