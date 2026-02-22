import database from "../service/database.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// ==========================================
// 🛠️ HELPER: Stat Calculation Tables & Logic
// ==========================================

// ปรับปรุงตารางค่าพลัง: เหลือแค่ HP, SPEED และ POWER (ซึ่งก็คือจำนวนตัวอักษร/Slot)
const STAT_DATA = {
  HP: {
    8: 7,
    9: 10,
    10: 13,
    11: 15,
    12: 18,
    13: 21,
    14: 24,
    15: 27,
    16: 30,
    17: 33,
    18: 36,
    19: 39,
    20: 40,
  },
  SPEED: {
    8: 4,
    9: 5,
    10: 6,
    11: 7,
    12: 8,
    13: 9,
    14: 10,
    15: 11,
    16: 12,
    17: 13,
    18: 14,
    19: 15,
    20: 16,
  },
  // POWER ในที่นี้คือจำนวนช่องตัวอักษร (เดิมคือ Slot)
  POWER: {
    8: 8,
    9: 9,
    10: 10,
    11: 11,
    12: 12,
    13: 13,
    14: 14,
    15: 15,
    16: 16,
    17: 17,
    18: 18,
    19: 19,
    20: 20,
  },
};

function getCalculatedStats(baseHpLv, basePowerLv, baseSpeedLv, currentLevel) {
  // ⭐ Default base levels to 8 if not present
  const bHp = Number(baseHpLv) || 8;
  const bPower = Number(basePowerLv) || 8;
  const bSpeed = Number(baseSpeedLv) || 8;
  const cLevel = Number(currentLevel) || 1;

  const levelModifier = cLevel - 1;

  const effectiveHpLv = bHp + levelModifier;
  const effectivePowerLv = bPower + levelModifier;
  const effectiveSpeedLv = bSpeed + levelModifier;

  const finalHp = STAT_DATA.HP[effectiveHpLv] || STAT_DATA.HP[20] || 0;
  const finalSpeed =
    STAT_DATA.SPEED[effectiveSpeedLv] || STAT_DATA.SPEED[20] || 0;
  const finalPower =
    STAT_DATA.POWER[effectivePowerLv] ||
    STAT_DATA.POWER[20] ||
    effectivePowerLv;

  return {
    hp: finalHp,
    speed: finalSpeed,
    power: finalPower, // จำนวนตัวอักษรที่ใส่ได้ใน slot

    levels: {
      hp_lv: effectiveHpLv,
      speed_lv: effectiveSpeedLv,
      power_lv: effectivePowerLv,
    },
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
      [username],
    );
    if (checkUser.rowCount > 0) {
      return res.json({ isSuccess: false, message: "username already exists" });
    }

    const checkEmail = await client.query(
      `SELECT 1 FROM player WHERE email = $1`,
      [email],
    );
    if (checkEmail.rowCount > 0) {
      return res.json({ isSuccess: false, message: "email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 11);

    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO player (username, password_hash, email, role)
      VALUES ($1,$2,$3,'player')
      `,
      [username, passwordHash, email],
    );

    await client.query(
      `
      INSERT INTO player_resource
      (player_id, coin, potion_slot, heal_count, heal_lv, cure_count, cure_lv, reroll_count, reroll_lv)
      VALUES ($1, 0, 3, 1, 1, 1, 1, 1, 1)
      `,
      [username],
    );

    await client.query(
      `
      INSERT INTO player_stage_progress
      (player_id, stage_id, last_distant, is_completed, is_current)
      VALUES ($1,'green-grass-1',0,false,true)
      `,
      [username],
    );

    const heroResult = await client.query(`SELECT * FROM hero WHERE id = $1`, [
      "chara",
    ]);

    if (heroResult.rowCount > 0) {
      const hero = heroResult.rows[0];
      await client.query(
        `
          INSERT INTO player_hero
          (player_id, hero_id, level, next_upgrade, is_selected)
          VALUES ($1,$2,1,100,true)
          `,
        [username, hero.id],
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

    // ✅ เช็ค first login
    const isFirstLogin = !userRow.first_login_at;

    if (isFirstLogin) {
      await database.query(
        `
        UPDATE player 
        SET first_login_at = NOW() 
        WHERE username = $1
        `,
        [username]
      );
    }

    // =============================
    // โหลดข้อมูล hero
    // =============================
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
        h.ability_code,
        h.ability_description,
        h.ability_cost,

        -- 🔥 NEW: hero deck
        (
          SELECT json_agg(
            json_build_object(
              'id', hd.id,
              'effect', hd.effect,
              'size', hd.size
            )
          )
          FROM hero_deck hd
          WHERE hd.hero_id = ph.hero_id
        ) AS deck_list

      FROM player_hero ph
      JOIN hero h ON ph.hero_id = h.id
      WHERE ph.player_id = $1
      ORDER BY ph.hero_id ASC
      `,
      [username] // ⚠️ checkAuth ใช้ userRow.username
    );

    const heroesWithStats = heroResult.rows.map((hero) => {
      const calculated = getCalculatedStats(
        hero.hp_lv || 8,
        hero.power_lv || 8,
        hero.speed_lv || 8,
        hero.level
      );
      return { ...hero, stats: calculated };
    });

    // =============================
    // โหลด stage
    // =============================
    const stageResult = await database.query(
      `
      SELECT *
      FROM player_stage_progress
      WHERE player_id = $1
      ORDER BY stage_id ASC
      `,
      [username]
    );

    // =============================
    // โหลด resource
    // =============================
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
      max_slot: resourceData.potion_slot || 3,
    };

    const theuser = {
      username: userRow.username,
      role: userRow.role,
      money: resourceData.coin || 0,
      heroes: heroesWithStats,
      stages: stageResult.rows,
      potion: potionData,
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
      firstTime: isFirstLogin, // ✅ ส่งกลับไป frontend
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
      [username],
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
        h.ability_code,
        h.ability_description,
        h.ability_cost,

        -- 🔥 NEW: hero deck
        (
          SELECT json_agg(
            json_build_object(
              'id', hd.id,
              'effect', hd.effect,
              'size', hd.size
            )
          )
          FROM hero_deck hd
          WHERE hd.hero_id = ph.hero_id
        ) AS deck_list

      FROM player_hero ph
      JOIN hero h ON ph.hero_id = h.id
      WHERE ph.player_id = $1
      ORDER BY ph.hero_id ASC
      `,
      [username] // ⚠️ checkAuth ใช้ userRow.username
    );

    const heroesWithStats = heroResult.rows.map((hero) => {
      const calculated = getCalculatedStats(
        hero.hp_lv || 8,
        hero.power_lv || 8,
        hero.speed_lv || 8,
        hero.level,
      );
      return {
        ...hero,
        stats: calculated,
      };
    });

    const stageResult = await database.query(
      `
      SELECT *
      FROM player_stage_progress
      WHERE player_id = $1
      ORDER BY stage_id ASC
      `,
      [userRow.username],
    );

    const resourceResult = await database.query(
      `SELECT * FROM player_resource WHERE player_id = $1`,
      [username],
    );

    const resourceData = resourceResult.rows[0] || {};
    const potionData = {
      health: resourceData.heal_count || 0,
      heal_lv: resourceData.heal_lv || 1,
      cure: resourceData.cure_count || 0,
      cure_lv: resourceData.cure_lv || 1,
      reroll: resourceData.reroll_count || 0,
      reroll_lv: resourceData.reroll_lv || 1,
      max_slot: resourceData.potion_slot || 3,
    };

    const theuser = {
      username: userRow.username,
      role: userRow.role,
      money: resourceData.coin || 0,
      heroes: heroesWithStats,
      stages: stageResult.rows,
      potion: potionData,
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
      [username],
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
      [username],
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
        h.hp_lv, h.power_lv, h.speed_lv, h.ability_code, h.ability_cost, h.ability_description
      FROM updated_ph uph
      JOIN hero h ON uph.hero_id = h.id
      `,
      [username, heroId],
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
      heroRow.level,
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

    const heroResult = await client.query(`SELECT * FROM hero WHERE id = $1`, [
      heroId,
    ]);
    if (heroResult.rowCount === 0) {
      throw new Error("hero not found");
    }

    const hero = heroResult.rows[0];

    const owned = await client.query(
      `SELECT 1 FROM player_hero WHERE player_id = $1 AND hero_id = $2`,
      [username, heroId],
    );
    if (owned.rowCount > 0) {
      return res.json({ isSuccess: false, message: "hero already owned" });
    }

    const resourceResult = await client.query(
      `SELECT coin FROM player_resource WHERE player_id = $1`,
      [username],
    );
    const money = resourceResult.rows[0]?.coin || 0;

    if (money < hero.price) {
      return res.json({ isSuccess: false, message: "not enough money" });
    }

    await client.query(
      `UPDATE player_resource SET coin = coin - $1 WHERE player_id = $2`,
      [hero.price, username],
    );

    const newHeroResult = await client.query(
      `
      INSERT INTO player_hero (
        player_id, hero_id,
        level, next_upgrade, is_selected
      )
      VALUES (
        $1, $2,
        1,100,false
      )
      RETURNING *
      `,
      [username, hero.id],
    );

    const newHero = newHeroResult.rows[0];

    const calculated = getCalculatedStats(
      hero.hp_lv,
      hero.power_lv,
      hero.speed_lv,
      newHero.level,
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

  console.log(
    `POST / Unlock Next Stage for: ${username}, Current: ${currentStageId}`,
  );

  if (!currentStageId) {
    return res
      .status(400)
      .json({ isSuccess: false, message: "Missing currentStageId" });
  }

  const client = await database.connect();

  try {
    await client.query("BEGIN");

    const checkProgress = await client.query(
      `SELECT is_completed FROM player_stage_progress WHERE player_id = $1 AND stage_id = $2`,
      [username, currentStageId],
    );

    if (checkProgress.rowCount === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ isSuccess: false, message: "Stage progress not found" });
    }

    const isAlreadyCompleted = checkProgress.rows[0].is_completed;

    if (isAlreadyCompleted) {
      await client.query("COMMIT");
      return res.json({
        isSuccess: true,
        message: "Stage completed (Replay).",
        newUnlock: false,
      });
    }

    await client.query(
      `
      UPDATE player_stage_progress
      SET is_completed = true, is_current = false
      WHERE player_id = $1 AND stage_id = $2
      `,
      [username, currentStageId],
    );

    const findNextStageQuery = `
      SELECT s2.id AS next_stage_id, s2.name AS next_stage_name
      FROM stage s1
      JOIN stage s2 ON s2."orderNo" = s1."orderNo" + 1
      WHERE s1.id = $1
    `;
    const nextStageResult = await client.query(findNextStageQuery, [
      currentStageId,
    ]);
    const nextStage = nextStageResult.rows[0];

    if (nextStage) {
      const checkNextStageExist = await client.query(
        `SELECT 1 FROM player_stage_progress WHERE player_id = $1 AND stage_id = $2`,
        [username, nextStage.next_stage_id],
      );

      if (checkNextStageExist.rowCount === 0) {
        await client.query(
          `
          INSERT INTO player_stage_progress 
          (player_id, stage_id, last_distant, is_completed, is_current)
          VALUES ($1, $2, 0, false, true)
          `,
          [username, nextStage.next_stage_id],
        );
      } else {
        await client.query(
          `
          UPDATE player_stage_progress 
          SET is_current = true 
          WHERE player_id = $1 AND stage_id = $2
          `,
          [username, nextStage.next_stage_id],
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
      nextStage: nextStage,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("unlockNextStage error:", error);
    return res.status(500).json({ isSuccess: false, message: error.message });
  } finally {
    client.release();
  }
}

export async function updateMoney(req, res) {
  const { amount } = req.body; // ✅ เปลี่ยนจาก money -> amount
  const username = req.user.username;

  if (amount === undefined || amount === null) {
    return res.status(400).json({
      isSuccess: false,
      message: "Please provide 'amount' value.",
    });
  }

  try {
    // ✅ กันเงินติดลบ
    const result = await database.query(
      `
      UPDATE player_resource
      SET coin = GREATEST(coin + $1, 0)
      WHERE player_id = $2
      RETURNING coin
      `,
      [amount, username],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        isSuccess: false,
        message: "Player resource not found",
      });
    }

    return res.json({
      isSuccess: true,
      message: amount >= 0 ? "Money added" : "Money deducted",
      currentMoney: result.rows[0].coin,
    });
  } catch (error) {
    console.error("updateMoney error:", error);
    return res.status(500).json({ isSuccess: false, message: error.message });
  }
}

export async function updateResources(req, res) {
  const username = req.user.username;
  const { heal, cure, reroll } = req.body;

  const client = await database.connect();

  try {
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
      return res
        .status(404)
        .json({ isSuccess: false, message: "Player resource not found" });
    }

    return res.json({
      isSuccess: true,
      message: "Resources updated",
      resources: {
        health: result.rows[0].heal_count,
        cure: result.rows[0].cure_count,
        reroll: result.rows[0].reroll_count,
      },
    });
  } catch (error) {
    console.error("updateResources error:", error);
    return res.status(500).json({ isSuccess: false, message: error.message });
  } finally {
    client.release();
  }
}

export async function levelUpHero(req, res) {
  const { heroId } = req.body;
  const username = req.user.username;

  if (!heroId) {
    return res
      .status(400)
      .json({ isSuccess: false, message: "Missing heroId" });
  }

  const client = await database.connect();

  try {
    await client.query("BEGIN");

    const heroResult = await client.query(
      `
      SELECT level, next_upgrade
      FROM player_hero
      WHERE player_id = $1 AND hero_id = $2
      `,
      [username, heroId],
    );

    if (heroResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ isSuccess: false, message: "Hero not found" });
    }

    const currentCost = Number(heroResult.rows[0].next_upgrade) || 100;

    const resourceResult = await client.query(
      `SELECT coin FROM player_resource WHERE player_id = $1`,
      [username],
    );

    const money = Number(resourceResult.rows[0]?.coin || 0);

    if (money < currentCost) {
      await client.query("ROLLBACK");
      return res.json({ isSuccess: false, message: "not enough money" });
    }

    await client.query(
      `UPDATE player_resource SET coin = coin - $1 WHERE player_id = $2`,
      [currentCost, username],
    );

    const newNextUpgrade = Math.floor(currentCost * 1.5);

    await client.query(
      `
      UPDATE player_hero
      SET level = level + 1, next_upgrade = $1
      WHERE player_id = $2 AND hero_id = $3
      `,
      [newNextUpgrade, username, heroId],
    );

    const heroDetails = await client.query(
      `
      SELECT ph.*, h.hp_lv, h.power_lv, h.speed_lv, h.name, h.ability_code
      FROM player_hero ph
      JOIN hero h ON ph.hero_id = h.id
      WHERE ph.player_id = $1 AND ph.hero_id = $2
      `,
      [username, heroId],
    );

    const heroRow = heroDetails.rows[0];
    const calculatedStats = getCalculatedStats(
      heroRow.hp_lv,
      heroRow.power_lv,
      heroRow.speed_lv,
      heroRow.level,
    );

    await client.query("COMMIT");

    return res.json({
      isSuccess: true,
      message: `Level Up! Now Level ${heroRow.level}`,
      hero: { ...heroRow, stats: calculatedStats },
      moneyLeft: money - currentCost,
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
    return res
      .status(400)
      .json({ isSuccess: false, message: "Missing heroId" });
  }

  const client = await database.connect();

  try {
    const result = await client.query(
      `
      SELECT ph.level, h.hp_lv, h.power_lv, h.speed_lv
      FROM player_hero ph
      JOIN hero h ON ph.hero_id = h.id
      WHERE ph.player_id = $1 AND ph.hero_id = $2
      `,
      [username, heroId],
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ isSuccess: false, message: "Hero not found" });
    }

    const heroRow = result.rows[0];
    const currentLevel = Number(heroRow.level);
    const nextLevel = currentLevel + 1;

    const currentStats = getCalculatedStats(
      heroRow.hp_lv,
      heroRow.power_lv,
      heroRow.speed_lv,
      currentLevel,
    );
    const nextStats = getCalculatedStats(
      heroRow.hp_lv,
      heroRow.power_lv,
      heroRow.speed_lv,
      nextLevel,
    );

    const comparison = {
      level: { current: currentLevel, next: nextLevel, diff: 1 },
      hp: {
        current: currentStats.hp,
        next: nextStats.hp,
        diff: nextStats.hp - currentStats.hp,
      },
      speed: {
        current: currentStats.speed,
        next: nextStats.speed,
        diff: nextStats.speed - currentStats.speed,
      },
      power: {
        current: currentStats.power,
        next: nextStats.power,
        diff: nextStats.power - currentStats.power,
      },
    };

    return res.json({ isSuccess: true, data: comparison });
  } catch (err) {
    console.error("previewLevelUp error:", err);
    return res.status(500).json({ isSuccess: false, message: err.message });
  } finally {
    client.release();
  }
}

export async function getPlayer(req, res) {
  try {
    const result = await database.query("SELECT * FROM player");
    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
