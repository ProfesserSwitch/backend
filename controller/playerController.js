import database from "../service/database.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// ==========================================
// ⚡ STAMINA CONFIG
// ==========================================
const STAMINA_REGEN_MS = 30 * 60 * 1000; // เวลาฟื้นฟู 1 ดวง = 30 นาที

// ==========================================
// 🛠️ HELPER: Stat Calculation Logic
// ==========================================

function getCalculatedStats(baseHp, basePower, baseSpeed, currentLevel) {
  const hp = Number(baseHp) || 0;
  const power = Number(basePower) || 0;
  const speed = Number(baseSpeed) || 0;
  const level = Number(currentLevel) || 1;

  const levelModifier = level - 1;

  // ⚙️ ตั้งค่าการเติบโตของ Status ต่อ 1 เลเวล
  const hpGrowthPerLevel = 2;
  const powerGrowthPerLevel = 1;
  const speedGrowthPerLevel = 1;

  const finalHp = hp + levelModifier * hpGrowthPerLevel;
  const finalSpeed = speed + levelModifier * speedGrowthPerLevel;
  const finalPower = power + levelModifier * powerGrowthPerLevel;

  return {
    hp: finalHp,
    speed: finalSpeed,
    power: finalPower,
    base: { hp, speed, power },
  };
}

// ✨ ฟังก์ชันใหม่สำหรับคำนวณ Deck Size ตาม Level
function getCalculatedDeck(deckList, level) {
  if (!deckList) return [];

  // คำนวณส่วนลด: ทุกๆ 4 เลเวล ลดลง 1 (เลเวล 4 = -1, เลเวล 8 = -2)
  const sizeReduction = Math.floor(level / 4);

  return deckList.map((card) => ({
    ...card,
    // ลด size ลง แต่ห้ามต่ำกว่า 1
    size: Math.max(1, card.size - sizeReduction),
  }));
}

// ==========================================
// 🛠️ HELPER: Stamina Calculation (PURE JS)
// 💡 THE FIX: ทำหน้าที่แค่ "คำนวณ" ไม่มีการยิง DB ซ้อน เพื่อป้องกัน Deadlock
// ==========================================
function calculateStaminaRegen(currentStamina, maxStamina, lastUpdateStr) {
  let stamina = Number(currentStamina);
  let max = Number(maxStamina);
  
  if (isNaN(stamina)) stamina = 0;
  if (isNaN(max)) max = 3;

  let lastUpdate = lastUpdateStr ? new Date(lastUpdateStr) : new Date();
  let timeToNext = 0;
  const now = new Date();
  let hasChanged = false;

  // ถ้าสายฟ้าเต็มอยู่แล้ว
  if (stamina >= max) {
    return { current: max, max, timeToNext: 0, newUpdateDate: now, hasChanged: true };
  }

  // คำนวณระยะเวลาที่ผ่านไป (มิลลิวินาที)
  const diffMs = now.getTime() - lastUpdate.getTime();
  const staminaToAdd = Math.floor(diffMs / STAMINA_REGEN_MS);

  let newUpdateDate = lastUpdate;

  if (staminaToAdd > 0) {
    stamina += staminaToAdd;
    // ขยับเวลาอัปเดตล่าสุดไปข้างหน้าตามจำนวนรอบที่เพิ่มมา
    newUpdateDate = new Date(lastUpdate.getTime() + (staminaToAdd * STAMINA_REGEN_MS));
    hasChanged = true;

    // ถ้าเพิ่มจนล้น ให้ล็อกไว้ที่ Max และรีเซ็ตเวลา
    if (stamina >= max) {
      stamina = max;
      newUpdateDate = now; 
    }
  }

  // คำนวณเวลาที่เหลือสำหรับดวงถัดไป
  if (stamina < max) {
    const nextRegenTime = newUpdateDate.getTime() + STAMINA_REGEN_MS;
    timeToNext = Math.max(0, nextRegenTime - now.getTime());
  }

  return { current: stamina, max, timeToNext, newUpdateDate, hasChanged };
}

// ==========================================
// 🎮 CONTROLLERS
// ==========================================

// ===============================
// REGISTER
// ===============================
export async function register(req, res) {
  const client = await database.connect();
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ isSuccess: false, message: "invalid data" });
    }

    const checkUser = await client.query(
      `SELECT 1 FROM player WHERE username = $1`,
      [username],
    );
    if (checkUser.rowCount > 0)
      return res.json({ isSuccess: false, message: "username already exists" });

    const checkEmail = await client.query(
      `SELECT 1 FROM player WHERE email = $1`,
      [email],
    );
    if (checkEmail.rowCount > 0)
      return res.json({ isSuccess: false, message: "email already exists" });

    const passwordHash = await bcrypt.hash(password, 11);
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO player (username, password_hash, email, role) VALUES ($1,$2,$3,'player')`,
      [username, passwordHash, email],
    );

    await client.query(
      `INSERT INTO player_resource (player_id, coin, potion_slot, heal_count, cure_count, reroll_count, current_stamina, max_stamina, last_stamina_update)
       VALUES ($1, 0, 3, 1, 1, 1, 3, 3, NOW())`,
      [username],
    );

    await client.query(
      `INSERT INTO player_stage_progress (player_id, stage_id, last_distant, is_completed, is_current)
       VALUES ($1,'green-grass-1',0,false,true)`,
      [username],
    );

    const heroResult = await client.query(`SELECT * FROM hero WHERE id = $1`, [
      "chavee",
    ]);
    if (heroResult.rowCount > 0) {
      await client.query(
        `INSERT INTO player_hero (player_id, hero_id, level, next_upgrade, is_selected) VALUES ($1,$2,1,100,true)`,
        [username, heroResult.rows[0].id],
      );
    }

    await client.query("COMMIT");
    return res.json({ isSuccess: true });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ isSuccess: false, message: err.message });
  } finally {
    client.release();
  }
}

// ===============================
// LOGIN
// ===============================
export async function login(req, res) {
  try {
    const { username, password } = req.body;
    const result = await database.query(
      `SELECT * FROM player WHERE username = $1`,
      [username],
    );

    if (result.rowCount === 0)
      return res.json({ isSuccess: false, message: "not found username" });
    const userRow = result.rows[0];
    if (!(await bcrypt.compare(password, userRow.password_hash))) {
      return res.json({ isSuccess: false, message: "invalid password" });
    }

    const isFirstLogin = !userRow.first_login_at;
    if (isFirstLogin) {
      await database.query(
        `UPDATE player SET first_login_at = NOW() WHERE username = $1`,
        [username],
      );
    }

    const heroResult = await database.query(
      `SELECT ph.id AS player_hero_id, ph.hero_id, ph.level, ph.next_upgrade, ph.is_selected,
              h.name, h.description, h.hp, h.power, h.speed, h.ability_cost, h.talk_win, h.talk_clear_stage,
              (SELECT json_agg(json_build_object('id', hd.id, 'effect', hd.effect, 'size', hd.size))
               FROM hero_deck hd WHERE hd.hero_id = ph.hero_id) AS deck_list
       FROM player_hero ph JOIN hero h ON ph.hero_id = h.id
       WHERE ph.player_id = $1 ORDER BY ph.hero_id ASC`,
      [username],
    );

    const heroesWithStats = heroResult.rows.map((hero) => {
      const stats = getCalculatedStats(
        hero.hp,
        hero.power,
        hero.speed,
        hero.level,
      );
      const updatedDeck = getCalculatedDeck(hero.deck_list, hero.level);
      return { ...hero, stats, deck_list: updatedDeck };
    });

    const stageResult = await database.query(
      `SELECT * FROM player_stage_progress WHERE player_id = $1 ORDER BY stage_id ASC`,
      [username],
    );
    const resourceResult = await database.query(
      `SELECT * FROM player_resource WHERE player_id = $1`,
      [username],
    );
    const resData = resourceResult.rows[0] || {};

    // 💡 THE FIX: เรียกใช้ PURE CALCULATION
    const regen = calculateStaminaRegen(
      resData.current_stamina,
      resData.max_stamina,
      resData.last_stamina_update
    );

    // ถ้ามีการเปลี่ยนแปลง ค่อยอัปเดตลง Database ทีเดียว
    if (regen.hasChanged) {
       await database.query(
         `UPDATE player_resource SET current_stamina = $1, last_stamina_update = $2 WHERE player_id = $3`,
         [regen.current, regen.newUpdateDate, username]
       );
    }

    const theuser = {
      username: userRow.username,
      role: userRow.role,
      money: resData.coin || 0,
      stamina: {
        current: regen.current,
        max: regen.max,
        timeToNext: regen.timeToNext
      }, 
      heroes: heroesWithStats,
      stages: stageResult.rows,
      potion: {
        health: resData.heal_count || 0,
        cure: resData.cure_count || 0,
        reroll: resData.reroll_count || 0,
        max_slot: resData.potion_slot || 3,
      },
    };

    const token = jwt.sign(
      { username: theuser.username, role: theuser.role },
      "ImGroot",
      { expiresIn: "7h" },
    );
    return res.json({
      isSuccess: true,
      token,
      user: theuser,
      firstTime: isFirstLogin,
    });
  } catch (err) {
    return res.status(500).json({ isSuccess: false, message: "error" });
  }
}

// ===============================
// CHECK AUTH
// ===============================
export async function checkAuth(req, res) {
  try {
    const username = req.user.username;
    const result = await database.query(
      `SELECT * FROM player WHERE username = $1`,
      [username],
    );
    if (result.rowCount === 0)
      return res.status(401).json({ isSuccess: false });

    const userRow = result.rows[0];
    const heroResult = await database.query(
      `SELECT ph.id AS player_hero_id, ph.hero_id, ph.level, ph.next_upgrade, ph.is_selected,
              h.name, h.description, h.hp, h.power, h.speed, h.ability_cost, h.talk_win, h.talk_clear_stage,
              (SELECT json_agg(json_build_object('id', hd.id, 'effect', hd.effect, 'size', hd.size))
               FROM hero_deck hd WHERE hd.hero_id = ph.hero_id) AS deck_list
       FROM player_hero ph JOIN hero h ON ph.hero_id = h.id
       WHERE ph.player_id = $1 ORDER BY ph.hero_id ASC`,
      [username],
    );

    const heroesWithStats = heroResult.rows.map((hero) => {
      const stats = getCalculatedStats(
        hero.hp,
        hero.power,
        hero.speed,
        hero.level,
      );
      const updatedDeck = getCalculatedDeck(hero.deck_list, hero.level);
      return { ...hero, stats, deck_list: updatedDeck };
    });

    const stageResult = await database.query(
      `SELECT * FROM player_stage_progress WHERE player_id = $1 ORDER BY stage_id ASC`,
      [username],
    );
    const resourceResult = await database.query(
      `SELECT * FROM player_resource WHERE player_id = $1`,
      [username],
    );
    const resData = resourceResult.rows[0] || {};

    // 💡 THE FIX: เรียกใช้ PURE CALCULATION
    const regen = calculateStaminaRegen(
      resData.current_stamina,
      resData.max_stamina,
      resData.last_stamina_update
    );

    // ถ้ามีการเปลี่ยนแปลง ค่อยอัปเดตลง Database ทีเดียว
    if (regen.hasChanged) {
       await database.query(
         `UPDATE player_resource SET current_stamina = $1, last_stamina_update = $2 WHERE player_id = $3`,
         [regen.current, regen.newUpdateDate, username]
       );
    }

    return res.json({
      isSuccess: true,
      user: {
        username: userRow.username,
        role: userRow.role,
        money: resData.coin || 0,
        stamina: {
          current: regen.current,
          max: regen.max,
          timeToNext: regen.timeToNext
        },
        heroes: heroesWithStats,
        stages: stageResult.rows,
        potion: {
          health: resData.heal_count || 0,
          cure: resData.cure_count || 0,
          reroll: resData.reroll_count || 0,
          max_slot: resData.potion_slot || 3,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ isSuccess: false });
  }
}

export async function logout(req, res) {
  return res.json({ isSuccess: true });
}

export async function checkFirstTime(req, res) {
  try {
    const username = req.user?.username;
    const result = await database.query(
      `SELECT 1 FROM player_hero WHERE player_id = $1 LIMIT 1`,
      [username],
    );
    return res.json({ isSuccess: true, firstTime: result.rowCount === 0 });
  } catch (error) {
    return res.status(500).json({ isSuccess: false, message: "server error" });
  }
}

export async function selectHero(req, res) {
  const client = await database.connect();
  try {
    const { heroId } = req.body;
    const username = req.user.username;
    await client.query("BEGIN");
    await client.query(
      `UPDATE player_hero SET is_selected = false WHERE player_id = $1`,
      [username],
    );
    const result = await client.query(
      `WITH updated_ph AS (UPDATE player_hero SET is_selected = true WHERE player_id = $1 AND hero_id = $2 RETURNING *)
       SELECT uph.*, h.hp, h.power, h.speed, h.ability_cost, h.talk_win, h.talk_clear_stage
       FROM updated_ph uph JOIN hero h ON uph.hero_id = h.id`,
      [username, heroId],
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ isSuccess: false });
    }

    const heroRow = result.rows[0];
    const stats = getCalculatedStats(
      heroRow.hp,
      heroRow.power,
      heroRow.speed,
      heroRow.level,
    );
    await client.query("COMMIT");
    return res.json({ isSuccess: true, selectedHero: { ...heroRow, stats } });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ isSuccess: false });
  } finally {
    client.release();
  }
}

export async function buyHero(req, res) {
  const client = await database.connect();
  try {
    const { heroId } = req.body;
    const username = req.user.username;
    await client.query("BEGIN");
    const hRes = await client.query(`SELECT * FROM hero WHERE id = $1`, [
      heroId,
    ]);
    if (hRes.rowCount === 0) throw new Error("hero not found");
    const hero = hRes.rows[0];

    const rRes = await client.query(
      `SELECT coin FROM player_resource WHERE player_id = $1`,
      [username],
    );
    const money = rRes.rows[0]?.coin || 0;
    if (money < hero.price)
      return res.json({ isSuccess: false, message: "not enough money" });

    await client.query(
      `UPDATE player_resource SET coin = coin - $1 WHERE player_id = $2`,
      [hero.price, username],
    );
    const nHero = await client.query(
      `INSERT INTO player_hero (player_id, hero_id, level, next_upgrade, is_selected) VALUES ($1,$2,1,100,false) RETURNING *`,
      [username, hero.id],
    );

    const stats = getCalculatedStats(hero.hp, hero.power, hero.speed, 1);
    await client.query("COMMIT");
    return res.json({
      isSuccess: true,
      hero: { ...nHero.rows[0], stats },
      moneyLeft: money - hero.price,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ isSuccess: false });
  } finally {
    client.release();
  }
}

export async function unlockNextStage(req, res) {
  const { currentStageId } = req.body;
  const username = req.user.username;
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const progress = await client.query(
      `SELECT is_completed FROM player_stage_progress WHERE player_id = $1 AND stage_id = $2`,
      [username, currentStageId],
    );
    if (progress.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ isSuccess: false });
    }

    if (progress.rows[0].is_completed) {
      await client.query("COMMIT");
      return res.json({ isSuccess: true, newUnlock: false });
    }

    await client.query(
      `UPDATE player_stage_progress SET is_completed = true, is_current = false WHERE player_id = $1 AND stage_id = $2`,
      [username, currentStageId],
    );
    const nextStage = await client.query(
      `SELECT s2.id AS next_stage_id, s2.name AS next_stage_name FROM stage s1 JOIN stage s2 ON s2."orderNo" = s1."orderNo" + 1 WHERE s1.id = $1`,
      [currentStageId],
    );

    if (nextStage.rows[0]) {
      const nextId = nextStage.rows[0].next_stage_id;
      const exist = await client.query(
        `SELECT 1 FROM player_stage_progress WHERE player_id = $1 AND stage_id = $2`,
        [username, nextId],
      );
      if (exist.rowCount === 0) {
        await client.query(
          `INSERT INTO player_stage_progress (player_id, stage_id, last_distant, is_completed, is_current) VALUES ($1, $2, 0, false, true)`,
          [username, nextId],
        );
      } else {
        await client.query(
          `UPDATE player_stage_progress SET is_current = true WHERE player_id = $1 AND stage_id = $2`,
          [username, nextId],
        );
      }
    }
    await client.query("COMMIT");
    return res.json({
      isSuccess: true,
      newUnlock: true,
      nextStage: nextStage.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ isSuccess: false });
  } finally {
    client.release();
  }
}

export async function updateMoney(req, res) {
  try {
    // 🌟 FIX: รับค่ามาแล้วแปลงเป็น Number ทันที ถ้าแปลงไม่ได้ (NaN, undefined) จะให้ค่าเป็น 0 ป้องกัน Database พัง
    let { amount } = req.body;
    amount = Number(amount) || 0; 
    
    const result = await database.query(
      `UPDATE player_resource SET coin = GREATEST(coin + $1, 0) WHERE player_id = $2 RETURNING coin`,
      [amount, req.user.username],
    );
    return res.json({ isSuccess: true, currentMoney: result.rows[0].coin });
  } catch (error) {
    return res.status(500).json({ isSuccess: false });
  }
}

export async function updateResources(req, res) {
  try {
    const { heal, cure, reroll, stamina } = req.body;
    const result = await database.query(
      `UPDATE player_resource SET heal_count = COALESCE($1, heal_count), cure_count = COALESCE($2, cure_count), reroll_count = COALESCE($3, reroll_count), current_stamina = COALESCE($4, current_stamina)
       WHERE player_id = $5 RETURNING heal_count, cure_count, reroll_count, current_stamina`,
      [heal, cure, reroll, stamina, req.user.username],
    );
    return res.json({
      isSuccess: true,
      resources: {
        health: result.rows[0].heal_count,
        cure: result.rows[0].cure_count,
        reroll: result.rows[0].reroll_count,
        stamina: result.rows[0].current_stamina,
      },
    });
  } catch (error) {
    return res.status(500).json({ isSuccess: false });
  }
}

export async function levelUpHero(req, res) {
  const client = await database.connect();
  try {
    const { heroId } = req.body;
    const username = req.user.username;
    await client.query("BEGIN");
    const hRes = await client.query(
      `SELECT level, next_upgrade FROM player_hero WHERE player_id = $1 AND hero_id = $2`,
      [username, heroId],
    );
    if (hRes.rowCount === 0) throw new Error("Hero not found");

    const cost = Number(hRes.rows[0].next_upgrade);
    const rRes = await client.query(
      `SELECT coin FROM player_resource WHERE player_id = $1`,
      [username],
    );
    if (Number(rRes.rows[0].coin) < cost)
      return res.json({ isSuccess: false, message: "not enough money" });

    await client.query(
      `UPDATE player_resource SET coin = coin - $1 WHERE player_id = $2`,
      [cost, username],
    );
    await client.query(
      `UPDATE player_hero SET level = level + 1, next_upgrade = floor($1 * 1.5) WHERE player_id = $2 AND hero_id = $3`,
      [cost, username, heroId],
    );

    const details = await client.query(
      `SELECT ph.*, h.hp, h.power, h.speed, h.name FROM player_hero ph JOIN hero h ON ph.hero_id = h.id WHERE ph.player_id = $1 AND ph.hero_id = $2`,
      [username, heroId],
    );
    const heroRow = details.rows[0];
    const stats = getCalculatedStats(
      heroRow.hp,
      heroRow.power,
      heroRow.speed,
      heroRow.level,
    );

    await client.query("COMMIT");
    return res.json({
      isSuccess: true,
      hero: { ...heroRow, stats },
      moneyLeft: Number(rRes.rows[0].coin) - cost,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ isSuccess: false });
  } finally {
    client.release();
  }
}

export async function previewLevelUp(req, res) {
  try {
    const { heroId } = req.body;
    const resu = await database.query(
      `SELECT ph.level, h.hp, h.power, h.speed FROM player_hero ph JOIN hero h ON ph.hero_id = h.id WHERE ph.player_id = $1 AND ph.hero_id = $2`,
      [req.user.username, heroId],
    );
    const row = resu.rows[0];
    const curStats = getCalculatedStats(
      row.hp,
      row.power,
      row.speed,
      row.level,
    );
    const nxtStats = getCalculatedStats(
      row.hp,
      row.power,
      row.speed,
      row.level + 1,
    );
    return res.json({
      isSuccess: true,
      data: {
        level: { current: row.level, next: row.level + 1 },
        hp: { current: curStats.hp, next: nxtStats.hp },
        power: { current: curStats.power, next: nxtStats.power },
        speed: { current: curStats.speed, next: nxtStats.speed },
      },
    });
  } catch (err) {
    return res.status(500).json({ isSuccess: false });
  }
}

// ===============================
// UPGRADE POTION SLOT (Simple)
// ===============================
export async function upgradePotionSlot(req, res) {
  try {
    const username = req.user.username;
    
    // เพิ่มค่า potion_slot ขึ้น 1 และคืนค่ากลับมา
    const result = await database.query(
      `UPDATE player_resource 
       SET potion_slot = potion_slot + 1 
       WHERE player_id = $1 
       RETURNING potion_slot`,
      [username]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ isSuccess: false, message: "Player not found" });
    }

    return res.json({
      isSuccess: true,
      currentPotionSlot: result.rows[0].potion_slot
    });
  } catch (error) {
    console.error("upgradePotionSlot error:", error);
    return res.status(500).json({ isSuccess: false, message: "Server error" });
  }
}

// ==========================================
// ⚡ UPDATE STAMINA ONLY (+/-)
// ==========================================
export async function updateStamina(req, res) {
  const username = req.user.username;
  const { amount } = req.body; // ส่งมาเป็น { "amount": -1 } หรือ { "amount": 1 }

  if (amount === undefined) {
    return res.status(400).json({ isSuccess: false, message: "Missing amount" });
  }

  const client = await database.connect();
  try {
    await client.query("BEGIN");

    const checkRes = await client.query(
      `SELECT current_stamina, max_stamina, last_stamina_update FROM player_resource WHERE player_id = $1 FOR UPDATE`,
      [username]
    );

    if (checkRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ isSuccess: false, message: "Player not found" });
    }

    let { current_stamina, max_stamina, last_stamina_update } = checkRes.rows[0];

    const regen = calculateStaminaRegen(current_stamina, max_stamina, last_stamina_update);
    let newStamina = regen.current;
    let newUpdateDate = regen.newUpdateDate;
    
    // 💡 THE FIX: เช็คว่าก่อนที่จะหัก สายฟ้ามันเต็มอยู่หรือเปล่า
    const wasFull = regen.current >= max_stamina;

    // ถ้ากำลังจะลบ (-1) แต่ Stamina เป็น 0 อยู่แล้ว
    if (amount < 0 && newStamina <= 0) {
      await client.query("ROLLBACK");
      return res.json({ isSuccess: false, message: "Not enough stamina", stamina: { current: regen.current, max: regen.max, timeToNext: regen.timeToNext } });
    }

    // คำนวณค่าใหม่
    newStamina = Math.max(Math.min(newStamina + amount, max_stamina), 0);
    
    // 💡 THE FIX: ถ้าพลังงานถูกหักจากที่เคย "เต็ม" (3/3) ค่อยเริ่มนับถอยหลังรอบใหม่ 
    // แต่ถ้ามันแหว่งอยู่แล้ว (เช่น 2/3) ให้ยึดเวลาเดิมต่อไป!
    if (amount < 0 && wasFull) {
       newUpdateDate = new Date(); 
    }

    const result = await client.query(
      `UPDATE player_resource SET current_stamina = $1, last_stamina_update = $2 WHERE player_id = $3 RETURNING current_stamina, max_stamina`,
      [newStamina, newUpdateDate, username]
    );

    await client.query("COMMIT");

    return res.json({
      isSuccess: true,
      message: amount >= 0 ? "Stamina increased" : "Stamina decreased",
      stamina: {
        current: result.rows[0].current_stamina,
        max: result.rows[0].max_stamina,
        // 💡 THE FIX: ส่งเวลาที่ถูกต้องกลับไปให้ Frontend
        timeToNext: (amount < 0 && wasFull) ? STAMINA_REGEN_MS : regen.timeToNext 
      }
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("updateStamina error:", error);
    return res.status(500).json({ isSuccess: false, message: error.message });
  } finally {
    client.release();
  }
}

// ==========================================
// ⏳ REDUCE STAMINA TIMER (มินิเกมตอบถูก)
// ==========================================
export async function reduceStaminaTimer(req, res) {
  const username = req.user.username;
  const { minutes } = req.body; 

  if (!minutes || isNaN(minutes)) {
    return res.status(400).json({ isSuccess: false, message: "Invalid minutes" });
  }

  const client = await database.connect();
  try {
    await client.query("BEGIN");

    // 1. ดึงข้อมูลปัจจุบัน
    const checkRes = await client.query(
      `SELECT current_stamina, max_stamina, last_stamina_update FROM player_resource WHERE player_id = $1 FOR UPDATE`,
      [username]
    );

    if (checkRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ isSuccess: false, message: "Player not found" });
    }

    let { current_stamina, max_stamina, last_stamina_update } = checkRes.rows[0];

    // 2. คำนวณ Stamina ปัจจุบัน (เผื่อเวลาผ่านไปแล้วแต่ผู้เล่นไม่ได้ Refresh หน้าจอ)
    const regen = calculateStaminaRegen(current_stamina, max_stamina, last_stamina_update);
    let newStamina = regen.current;
    let newUpdateDate = regen.newUpdateDate;

    // ถ้าสายฟ้าเต็มอยู่แล้ว ไม่ต้องทำอะไร ส่งกลับไปเลย
    if (newStamina >= max_stamina) {
      await client.query("ROLLBACK");
      return res.json({
        isSuccess: true,
        message: "Stamina is already full",
        stamina: {
          current: newStamina,
          max: max_stamina,
          timeToNext: 0
        }
      });
    }

    // 3. ลดเวลาลงตามจำนวนนาทีที่ส่งมา (แปลงเป็นมิลลิวินาที)
    // การ "ลดเวลาคูลดาวน์" เท่ากับการ "ถอยเวลาอัปเดตครั้งล่าสุด" ให้เก่าลงไปอีก!
    const msToReduce = minutes * 60 * 1000;
    
    // ถอยเวลาอัปเดตไปอดีต
    newUpdateDate = new Date(newUpdateDate.getTime() - msToReduce);

    // 4. คำนวณอีกรอบหลังจากถอยเวลาแล้ว ว่าได้สายฟ้าเพิ่มไหม?
    const finalRegen = calculateStaminaRegen(newStamina, max_stamina, newUpdateDate);

    // 5. บันทึกลง Database
    const result = await client.query(
      `UPDATE player_resource SET current_stamina = $1, last_stamina_update = $2 WHERE player_id = $3 RETURNING current_stamina, max_stamina`,
      [finalRegen.current, finalRegen.newUpdateDate, username]
    );

    await client.query("COMMIT");

    return res.json({
      isSuccess: true,
      message: "Timer reduced successfully",
      stamina: {
        current: result.rows[0].current_stamina,
        max: result.rows[0].max_stamina,
        timeToNext: finalRegen.timeToNext 
      }
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("reduceStaminaTimer error:", error);
    return res.status(500).json({ isSuccess: false, message: error.message });
  } finally {
    client.release();
  }
}

export async function getPlayer(req, res) {
  try {
    const result = await database.query(
      `SELECT username, email, role, created_at, is_online, first_login_at, last_online FROM player ORDER BY created_at DESC`,
    );
    return res.json({ isSuccess: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({ isSuccess: false });
  }
}

export async function updatePlayerRole(req, res) {
  try {
    const { username, role } = req.body;
    const result = await database.query(
      `UPDATE player SET role = $2 WHERE username = $1 RETURNING username, role`,
      [username, role],
    );
    return res.json({ isSuccess: true, data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ isSuccess: false });
  }
}