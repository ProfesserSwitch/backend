import database from "../service/database.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// ==========================================
// 🛠️ HELPER: Stat Calculation Tables & Logic
// ==========================================

// Updated Range: 8-20 (Shifted from 10-22)
const STAT_DATA = {
  HP: {
    8: 7, 9: 10, 10: 13, 11: 15, 12: 18, 13: 21,
    14: 24, 15: 27, 16: 30, 17: 33, 18: 36, 19: 39, 20: 40
  },
  SPEED: {
    8: 4, 9: 5, 10: 6, 11: 7, 12: 8, 13: 9,
    14: 10, 15: 11, 16: 12, 17: 13, 18: 14, 19: 15, 20: 16
  },
  SLOT: {
    8: 8, 9: 9, 10: 10, 11: 11, 12: 12, 13: 13,
    14: 14, 15: 15, 16: 16, 17: 17, 18: 18, 19: 19, 20: 20
  }
};

const POWER_GROUPS = {
  G1: ["A", "E", "I", "O", "U"],
  G2: ["L", "N", "S", "T", "R", "D", "G", "B", "C", "M", "P", "F", "H", "K"],
  G3: ["V", "W", "J", "X", "Y", "Q", "Z"]
};

// Updated Power Levels to start at Level 8 (Range 8-20)
const POWER_LEVELS = {
  8: { G1: 0.50, G2: 1.00, G3: 1.50 },
  9: { G1: 0.75, G2: 1.00, G3: 1.50 },
  10: { G1: 0.75, G2: 1.25, G3: 1.50 },
  11: { G1: 0.75, G2: 1.25, G3: 1.75 },
  12: { G1: 1.00, G2: 1.25, G3: 1.75 },
  13: { G1: 1.00, G2: 1.50, G3: 1.75 },
  14: { G1: 1.00, G2: 1.50, G3: 2.00 },
  15: { G1: 1.25, G2: 1.50, G3: 2.00 },
  16: { G1: 1.25, G2: 1.75, G3: 2.00 },
  17: { G1: 1.25, G2: 1.75, G3: 2.25 },
  18: { G1: 1.50, G2: 1.75, G3: 2.25 },
  19: { G1: 1.50, G2: 2.00, G3: 2.25 },
  20: { G1: 1.50, G2: 2.00, G3: 2.50 }
};

function getCalculatedStats(baseHpLv, basePowerLv, baseSpeedLv, baseSlotLv, currentLevel) {
  // ⭐ Default base levels to 8 if not present
  const bHp = Number(baseHpLv) || 8;
  const bPower = Number(basePowerLv) || 8;
  const bSpeed = Number(baseSpeedLv) || 8;
  const bSlot = Number(baseSlotLv) || 8;
  const cLevel = Number(currentLevel) || 1;

  const levelModifier = cLevel - 1;

  const effectiveHpLv = bHp + levelModifier;
  const effectivePowerLv = bPower + levelModifier;
  const effectiveSpeedLv = bSpeed + levelModifier;
  const effectiveSlotLv = bSlot + levelModifier;

  const finalHp = STAT_DATA.HP[effectiveHpLv] || STAT_DATA.HP[20] || 0;
  const finalSpeed = STAT_DATA.SPEED[effectiveSpeedLv] || STAT_DATA.SPEED[20] || 0;
  const finalSlot = STAT_DATA.SLOT[effectiveSlotLv] || STAT_DATA.SLOT[20] || effectiveSlotLv;
  const pValues = POWER_LEVELS[effectivePowerLv] || POWER_LEVELS[20];

  const finalPower = {};
  if (pValues) {
    POWER_GROUPS.G1.forEach(char => finalPower[char] = pValues.G1);
    POWER_GROUPS.G2.forEach(char => finalPower[char] = pValues.G2);
    POWER_GROUPS.G3.forEach(char => finalPower[char] = pValues.G3);
  }

  return {
    hp: finalHp,
    speed: finalSpeed,
    slot: finalSlot,
    power: finalPower, 
    
    common_tile_dmg: pValues ? pValues.G1 : 0,
    uncommon_tile_dmg: pValues ? pValues.G2 : 0,
    rare_tile_dmg: pValues ? pValues.G3 : 0,

    levels: {
      hp_lv: effectiveHpLv,
      speed_lv: effectiveSpeedLv,
      slot_lv: effectiveSlotLv,
      power_lv: effectivePowerLv
    }
  };
}

// ==========================================
// 🎮 CONTROLLERS
// ==========================================

// ===============================
// REGISTER
// ===============================
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

    const checkUser = await client.query(
      `SELECT 1 FROM player WHERE username = $1`,
      [username]
    );
    if (checkUser.rowCount > 0) {
      return res.json({ isSuccess: false, message: "username already exists" });
    }

    const checkEmail = await client.query(
      `SELECT 1 FROM player WHERE email = $1`,
      [email]
    );
    if (checkEmail.rowCount > 0) {
      return res.json({ isSuccess: false, message: "email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 11);

    await client.query("BEGIN");

    // ❌ ลบ money ออกจากตาราง player (เพราะย้ายไป player_resource)
    await client.query(
      `
      INSERT INTO player (username, password_hash, email, role)
      VALUES ($1,$2,$3,'player')
      `,
      [username, passwordHash, email]
    );

    // ⭐ เพิ่ม coin = 0 และค่าเริ่มต้นอื่นๆ ลงใน player_resource แทน
    // ใช้ค่าเริ่มต้น: Slot 3, ยาอย่างละ 1
    await client.query(
      `
      INSERT INTO player_resource
      (player_id, coin, potion_slot, heal_count, heal_lv, cure_count, cure_lv, reroll_count, reroll_lv)
      VALUES ($1, 0, 3, 1, 1, 1, 1, 1, 1)
      `,
      [username]
    );

    await client.query(
      `
      INSERT INTO player_stage_progress
      (player_id, stage_id, last_distant, is_completed, is_current)
      VALUES ($1,'green-grass-1',0,false,true)
      `,
      [username]
    );

    const heroResult = await client.query(
      `SELECT * FROM hero WHERE id = $1`,
      ["chara"] 
    );

    if (heroResult.rowCount > 0) {
        const hero = heroResult.rows[0];
        await client.query(
          `
          INSERT INTO player_hero
          (player_id, hero_id, level, next_upgrade, is_selected)
          VALUES ($1,$2,1,100,true)
          `,
          [username, hero.id]
        );
    }

    await client.query("COMMIT");

    return res.json({ isSuccess: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ isSuccess: false, message: err.message });
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

    const heroResult = await database.query(
      `
      SELECT 
        ph.id AS player_hero_id,
        ph.hero_id,
        ph.level,
        ph.next_upgrade,
        ph.is_selected,

        h.name,
        h.description,
        h.hp_lv,
        h.power_lv,
        h.speed_lv,
        h.slot_lv,
        h.ability_code,
        h.ability_description,
        h.ability_cost

      FROM player_hero ph
      JOIN hero h ON ph.hero_id = h.id
      WHERE ph.player_id = $1
      ORDER BY ph.hero_id ASC
      `,
      [userRow.username]
    );

    const heroesWithStats = heroResult.rows.map(hero => {
      // ใช้ || 8 เพื่อกันค่า null
      const calculated = getCalculatedStats(
        hero.hp_lv || 8, 
        hero.power_lv || 8, 
        hero.speed_lv || 8, 
        hero.slot_lv || 8, 
        hero.level
      );
      return {
        ...hero,
        stats: calculated 
      };
    });

    const stageResult = await database.query(
      `
      SELECT *
      FROM player_stage_progress
      WHERE player_id = $1
      ORDER BY stage_id ASC
      `,
      [userRow.username]
    );

    // ⭐ ดึงข้อมูล Resource (เงิน + ยา + เลเวลยา)
    const resourceResult = await database.query(
      `SELECT * FROM player_resource WHERE player_id = $1`,
      [username]
    );

    // เตรียม Object ยาแบบเต็มรูปแบบ
    const resourceData = resourceResult.rows[0] || {};
    const potionData = {
        health: resourceData.heal_count || 0,
        heal_lv: resourceData.heal_lv || 1,
        cure: resourceData.cure_count || 0,
        cure_lv: resourceData.cure_lv || 1,
        reroll: resourceData.reroll_count || 0,
        reroll_lv: resourceData.reroll_lv || 1,
        max_slot: resourceData.potion_slot || 3
    };

    const theuser = {
      username: userRow.username,
      role: userRow.role,
      money: resourceData.coin || 0, 
      heroes: heroesWithStats, 
      stages: stageResult.rows,
      potion: potionData 
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

export async function checkAuth(req, res) {
  try {
    const username = req.user.username;

    const result = await database.query(
      `SELECT * FROM player WHERE username = $1`,
      [username]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ isSuccess: false });
    }

    const userRow = result.rows[0];

    const heroResult = await database.query(
      `
      SELECT 
        ph.id AS player_hero_id,
        ph.hero_id,
        ph.level,
        ph.next_upgrade,
        ph.is_selected,

        h.name,
        h.description,
        h.hp_lv,
        h.power_lv,
        h.speed_lv,
        h.slot_lv,
        h.ability_code,
        h.ability_description,
        h.ability_cost

      FROM player_hero ph
      JOIN hero h ON ph.hero_id = h.id
      WHERE ph.player_id = $1
      ORDER BY ph.hero_id ASC
      `,
      [userRow.username]
    );

    const heroesWithStats = heroResult.rows.map(hero => {
      const calculated = getCalculatedStats(
        hero.hp_lv || 8, 
        hero.power_lv || 8, 
        hero.speed_lv || 8, 
        hero.slot_lv || 8, 
        hero.level
      );
      return {
        ...hero,
        stats: calculated
      };
    });

    const stageResult = await database.query(
      `
      SELECT *
      FROM player_stage_progress
      WHERE player_id = $1
      ORDER BY stage_id ASC
      `,
      [userRow.username]
    );

    // ⭐ ดึงข้อมูล Resource
    const resourceResult = await database.query(
      `SELECT * FROM player_resource WHERE player_id = $1`,
      [username]
    );

    const resourceData = resourceResult.rows[0] || {};
    const potionData = {
        health: resourceData.heal_count || 0,
        heal_lv: resourceData.heal_lv || 1,
        cure: resourceData.cure_count || 0,
        cure_lv: resourceData.cure_lv || 1,
        reroll: resourceData.reroll_count || 0,
        reroll_lv: resourceData.reroll_lv || 1,
        max_slot: resourceData.potion_slot || 3
    };

    const theuser = {
      username: userRow.username,
      role: userRow.role,
      money: resourceData.coin || 0, 
      heroes: heroesWithStats, 
      stages: stageResult.rows,
      potion: potionData
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

export async function logout(req, res) {
  return res.json({ isSuccess: true });
}

export async function checkFirstTime(req, res) {
  try {
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

    await client.query(
      `
      UPDATE player_hero
      SET is_selected = false
      WHERE player_id = $1
      `,
      [username]
    );

    const result = await client.query(
      `
      WITH updated_ph AS (
        UPDATE player_hero
        SET is_selected = true
        WHERE player_id = $1 AND hero_id = $2
        RETURNING *
      )
      SELECT 
        uph.*,
        h.hp_lv, h.power_lv, h.speed_lv, h.slot_lv, h.ability_code, h.ability_cost, h.ability_description
      FROM updated_ph uph
      JOIN hero h ON uph.hero_id = h.id
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

    const heroRow = result.rows[0];
    const calculated = getCalculatedStats(
        heroRow.hp_lv, 
        heroRow.power_lv, 
        heroRow.speed_lv, 
        heroRow.slot_lv, 
        heroRow.level
    );
    const selectedHeroWithStats = { ...heroRow, stats: calculated };

    await client.query("COMMIT");

    return res.json({
      isSuccess: true,
      selectedHero: selectedHeroWithStats,
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

    const heroResult = await client.query(
      `SELECT * FROM hero WHERE id = $1`,
      [heroId]
    );
    if (heroResult.rowCount === 0) {
      throw new Error("hero not found");
    }

    const hero = heroResult.rows[0];

    const owned = await client.query(
      `SELECT 1 FROM player_hero WHERE player_id = $1 AND hero_id = $2`,
      [username, heroId]
    );
    if (owned.rowCount > 0) {
      return res.json({ isSuccess: false, message: "hero already owned" });
    }

    // ⭐ เช็คเงินจาก player_resource (coin)
    const resourceResult = await client.query(
      `SELECT coin FROM player_resource WHERE player_id = $1`,
      [username]
    );
    const money = resourceResult.rows[0]?.coin || 0;

    if (money < hero.price) {
      return res.json({ isSuccess: false, message: "not enough money" });
    }

    // ⭐ หักเงินจาก player_resource
    await client.query(
      `UPDATE player_resource SET coin = coin - $1 WHERE player_id = $2`,
      [hero.price, username]
    );

    const newHeroResult = await client.query(
      `
      INSERT INTO player_hero (
        player_id, hero_id,
        level, next_upgrade, is_selected
      )
      VALUES (
        $1, $2,
        1,0,false
      )
      RETURNING *
      `,
      [
        username,
        hero.id,
      ]
    );

    const newHero = newHeroResult.rows[0];

    const calculated = getCalculatedStats(
        hero.hp_lv, 
        hero.power_lv, 
        hero.speed_lv, 
        hero.slot_lv, 
        newHero.level
    );

    await client.query("COMMIT");

    return res.json({
      isSuccess: true,
      hero: { ...newHero, stats: calculated }, 
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

    const checkProgress = await client.query(
      `SELECT is_completed FROM player_stage_progress WHERE player_id = $1 AND stage_id = $2`,
      [username, currentStageId]
    );

    if (checkProgress.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ isSuccess: false, message: "Stage progress not found" });
    }

    const isAlreadyCompleted = checkProgress.rows[0].is_completed;

    if (isAlreadyCompleted) {
      console.log(`User ${username} replayed stage ${currentStageId}. Nothing updated.`);
      await client.query("COMMIT");
      return res.json({
        isSuccess: true,
        message: "Stage completed (Replay).",
        newUnlock: false
      });
    }

    await client.query(
      `
      UPDATE player_stage_progress
      SET is_completed = true, is_current = false
      WHERE player_id = $1 AND stage_id = $2
      `,
      [username, currentStageId]
    );

    const findNextStageQuery = `
      SELECT s2.id AS next_stage_id, s2.name AS next_stage_name
      FROM stage s1
      JOIN stage s2 ON s2."orderNo" = s1."orderNo" + 1
      WHERE s1.id = $1
    `;
    const nextStageResult = await client.query(findNextStageQuery, [currentStageId]);
    const nextStage = nextStageResult.rows[0];

    if (nextStage) {
      const checkNextStageExist = await client.query(
        `SELECT 1 FROM player_stage_progress WHERE player_id = $1 AND stage_id = $2`,
        [username, nextStage.next_stage_id]
      );

      if (checkNextStageExist.rowCount === 0) {
        await client.query(
          `
          INSERT INTO player_stage_progress 
          (player_id, stage_id, last_distant, is_completed, is_current)
          VALUES ($1, $2, 0, false, true)
          `,
          [username, nextStage.next_stage_id]
        );
      } else {
        console.log(`Next stage ${nextStage.next_stage_id} already exists. Skipping INSERT.`);
        
        await client.query(
          `
          UPDATE player_stage_progress 
          SET is_current = true 
          WHERE player_id = $1 AND stage_id = $2
          `,
          [username, nextStage.next_stage_id]
        );
      }
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
  const { money } = req.body; 
  const username = req.user.username; 

  console.log(`POST / Update Money for: ${username} to: ${money}`);

  if (money === undefined || money === null) {
    return res.status(400).json({ 
      isSuccess: false, 
      message: "Please provide 'money' value." 
    });
  }

  try {
    // ⭐ แก้ไข: อัปเดตที่ตาราง player_resource (column: coin)
    const result = await database.query(
      `
      UPDATE player_resource 
      SET coin = $1 
      WHERE player_id = $2
      RETURNING coin
      `,
      [money, username]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ isSuccess: false, message: "Player resource not found" });
    }

    return res.json({
      isSuccess: true,
      message: "Money updated successfully",
      currentMoney: result.rows[0].coin
    });

  } catch (error) {
    console.error("updateMoney error:", error);
    return res.status(500).json({ 
      isSuccess: false, 
      message: error.message 
    });
  }
}

// ===============================
// 🧪 UPDATE POTIONS / RESOURCES
// ===============================
export async function updateResources(req, res) {
  const username = req.user.username; // รับจาก Token
  const { heal, cure, reroll } = req.body; // รับค่าจำนวนยาที่จะแก้

  console.log(`POST / Update Resources for: ${username}`, { heal, cure, reroll });

  const client = await database.connect();

  try {
    // ใช้ COALESCE เพื่อเช็คว่าถ้าไม่ได้ส่งค่ามา (เป็น null/undefined) ให้ใช้ค่าเดิมใน Database
    // $1, $2, $3 คือค่าใหม่ที่ส่งมา, $4 คือ username
    const query = `
      UPDATE player_resource
      SET 
        heal_count = COALESCE($1, heal_count),
        cure_count = COALESCE($2, cure_count),
        reroll_count = COALESCE($3, reroll_count)
      WHERE player_id = $4
      RETURNING heal_count, cure_count, reroll_count
    `;

    const result = await client.query(query, [heal, cure, reroll, username]);

    if (result.rowCount === 0) {
      return res.status(404).json({ 
        isSuccess: false, 
        message: "Player resource not found" 
      });
    }

    // ส่งค่าล่าสุดกลับไปให้หน้าบ้านอัปเดต State
    return res.json({
      isSuccess: true,
      message: "Resources updated",
      resources: {
        health: result.rows[0].heal_count,
        cure: result.rows[0].cure_count,
        reroll: result.rows[0].reroll_count
      }
    });

  } catch (error) {
    console.error("updateResources error:", error);
    return res.status(500).json({ 
      isSuccess: false, 
      message: error.message 
    });
  } finally {
    client.release();
  }
}

// ===============================
// 🆙 LEVEL UP (CALCULATE NEXT UPGRADE)
// ===============================
export async function levelUpHero(req, res) {
  const { heroId } = req.body;
  const username = req.user.username;

  console.log(`POST / Level Up +1 for: ${username}, Hero: ${heroId}`);

  if (!heroId) {
    return res.status(400).json({ isSuccess: false, message: "Missing heroId" });
  }

  const client = await database.connect();

  try {
    await client.query("BEGIN");

    // 1. ดึงข้อมูลปัจจุบันออกมาก่อน เพื่อเอามาคำนวณสูตร
    const currentHeroResult = await client.query(
      `SELECT level, next_upgrade FROM player_hero WHERE player_id = $1 AND hero_id = $2`,
      [username, heroId]
    );

    if (currentHeroResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ isSuccess: false, message: "Hero not found or not owned" });
    }

    const currentData = currentHeroResult.rows[0];
    const currentLevel = Number(currentData.level);
    const currentCost = Number(currentData.next_upgrade) || 100; // กันเหนียวถ้าเป็น 0 ให้เริ่มที่ 100

    // ⭐ FORMULA ZONE: สูตรคำนวณราคาขั้นถัดไป (แก้ไขตรงนี้ได้) ⭐
    // ตัวอย่าง: ราคาเดิม x 1.5 (เพิ่มขึ้น 50% ทุกเลเวล) และปัดเศษลง
    const newNextUpgrade = Math.floor(currentCost * 1.5);
    
    // หรือถ้าอยากให้เพิ่มทีละ 100 คงที่ ก็ใช้: const newNextUpgrade = currentCost + 100;

    // 2. อัปเดต Level +1 และค่า Next Upgrade ใหม่ลง Database
    const updateResult = await client.query(
      `
      UPDATE player_hero
      SET 
        level = level + 1,
        next_upgrade = $1
      WHERE player_id = $2 AND hero_id = $3
      RETURNING *
      `,
      [newNextUpgrade, username, heroId]
    );

    // 3. ดึงข้อมูล Hero Base Stats เพื่อมาคำนวณ Stats ใหม่ (เหมือนเดิม)
    const heroDetails = await client.query(
      `
      SELECT 
        ph.*,
        h.name, h.description,
        h.hp_lv, h.power_lv, h.speed_lv, h.slot_lv, 
        h.ability_code, h.ability_description, h.ability_cost
      FROM player_hero ph
      JOIN hero h ON ph.hero_id = h.id
      WHERE ph.player_id = $1 AND ph.hero_id = $2
      `,
      [username, heroId]
    );

    const heroRow = heroDetails.rows[0];

    // 4. คำนวณ Stats ใหม่ด้วย Level ที่เพิ่งอัปเดต
    const calculated = getCalculatedStats(
       heroRow.hp_lv, 
       heroRow.power_lv, 
       heroRow.speed_lv, 
       heroRow.slot_lv, 
       heroRow.level 
    );

    await client.query("COMMIT");

    return res.json({
      isSuccess: true,
      message: `Level Up! Now Level ${heroRow.level}`,
      hero: {
        ...heroRow,
        stats: calculated,
        // next_upgrade จะถูกส่งกลับไปใน heroRow อยู่แล้วจากการ query
      }
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("levelUpHero error:", err);
    return res.status(500).json({ isSuccess: false, message: err.message });
  } finally {
    client.release();
  }
}

export async function previewLevelUp(req, res) {
  const { heroId } = req.body;
  const username = req.user.username;

  if (!heroId) {
    return res.status(400).json({ isSuccess: false, message: "Missing heroId" });
  }

  const client = await database.connect();

  try {
    // 1. ดึงข้อมูล Hero
    const result = await client.query(
      `
      SELECT 
        ph.level,
        h.hp_lv, h.power_lv, h.speed_lv, h.slot_lv
      FROM player_hero ph
      JOIN hero h ON ph.hero_id = h.id
      WHERE ph.player_id = $1 AND ph.hero_id = $2
      `,
      [username, heroId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ isSuccess: false, message: "Hero not found" });
    }

    const heroRow = result.rows[0];
    const currentLevel = Number(heroRow.level);
    const nextLevel = currentLevel + 1;

    // 2. คำนวณ Stats ปัจจุบัน และ อนาคต
    const currentStats = getCalculatedStats(
      heroRow.hp_lv, heroRow.power_lv, heroRow.speed_lv, heroRow.slot_lv, currentLevel
    );

    const nextStats = getCalculatedStats(
      heroRow.hp_lv, heroRow.power_lv, heroRow.speed_lv, heroRow.slot_lv, nextLevel
    );

    // 3. ดึงค่าพลังโจมตีตัวแทนแต่ละกลุ่ม (ใช้ตัวอักษรตัวแรกของกลุ่มเป็นตัวแทน)
    // G1: "A", G2: "L", G3: "V" (อิงตาม POWER_GROUPS ที่คุณประกาศไว้ข้างบน)
    const curP = currentStats.power;
    const nxtP = nextStats.power;

    const formatDiff = (curr, next) => {
        const diff = next - curr;
        return {
            current: curr,
            next: next,
            diff: diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2) // ใส่เครื่องหมาย + ให้สวยงาม
        };
    };

    const comparison = {
      level: { 
          current: currentLevel, 
          next: nextLevel, 
          diff: 1 
      },
      hp: { 
          current: currentStats.hp, 
          next: nextStats.hp, 
          diff: nextStats.hp - currentStats.hp 
      },
      speed: { 
          current: currentStats.speed, 
          next: nextStats.speed, 
          diff: nextStats.speed - currentStats.speed 
      },
      slot: { 
          current: currentStats.slot, 
          next: nextStats.slot, 
          diff: nextStats.slot - currentStats.slot 
      },
      // ✅ เพิ่มครบทั้ง 3 Groups ตามที่ขอ
      power_G1: formatDiff(curP['A'] || 0, nxtP['A'] || 0), // สระ
      power_G2: formatDiff(curP['L'] || 0, nxtP['L'] || 0), // อักษรปกติ
      power_G3: formatDiff(curP['V'] || 0, nxtP['V'] || 0)  // อักษรยาก (V, W, J, X...)
    };

    return res.json({
      isSuccess: true,
      data: comparison
    });

  } catch (err) {
    console.error("previewLevelUp error:", err);
    return res.status(500).json({ isSuccess: false, message: err.message });
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