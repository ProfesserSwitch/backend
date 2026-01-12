
import database from "../service/database.js";

export async function addHeroExp(req, res) {
  try {
    const username = req.user?.username;
    const { hero_id, add_exp } = req.body;

    if (!username || !hero_id || typeof add_exp !== "number") {
      return res.status(400).json({
        isSuccess: false,
        message: "invalid data",
      });
    }

    // ดึงข้อมูลปัจจุบัน
    const result = await database.query(
      `
      SELECT *
      FROM player_hero
      WHERE player_id = $1 AND hero_id = $2
      `,
      [username, hero_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        isSuccess: false,
        message: "hero not found",
      });
    }

    let hero = result.rows[0];

    let currentExp = hero.current_exp + add_exp;
    let level = hero.level;
    let point = hero.point_for_added;
    let nextExp = hero.next_exp;

    // ⭐ level up loop (กัน exp ทะลุหลายเลเวล)
    while (currentExp >= nextExp) {
      currentExp -= nextExp;   // หรือ currentExp = 0 ถ้ามึงอยากง่าย
      level += 1;
      point += 1;
      nextExp = 100 + level * 20;
    }

    const update = await database.query(
      `
      UPDATE player_hero
      SET 
        current_exp = $1,
        level = $2,
        point_for_added = $3,
        next_exp = $4
      WHERE player_id = $5 AND hero_id = $6
      RETURNING *
      `,
      [currentExp, level, point, nextExp, username, hero_id]
    );

    return res.json({
      isSuccess: true,
      data: update.rows[0],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      isSuccess: false,
      message: "server error",
    });
  }
}

export async function upgradeHeroStat(req, res) {
  try {
    const username = req.user?.username;
    const {
      hero_id,
      add_str = 0,
      add_dex = 0,
      add_int = 0,
      add_con = 0,
      add_faith = 0,
      add_luck = 0,
    } = req.body;

    const totalAdd =
      add_str + add_dex + add_int + add_con + add_faith + add_luck;

    if (!username || !hero_id || totalAdd <= 0) {
      return res.status(400).json({
        isSuccess: false,
        message: "invalid data",
      });
    }

    const result = await database.query(
      `
      SELECT point_for_added
      FROM player_hero
      WHERE player_id = $1 AND hero_id = $2
      `,
      [username, hero_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        isSuccess: false,
        message: "hero not found",
      });
    }

    if (result.rows[0].point_for_added < totalAdd) {
      return res.status(400).json({
        isSuccess: false,
        message: "not enough point",
      });
    }

    const update = await database.query(
      `
      UPDATE player_hero
      SET
        added_str = added_str + $1,
        added_dex = added_dex + $2,
        added_int = added_int + $3,
        added_con = added_con + $4,
        added_faith = added_faith + $5,
        added_luck = added_luck + $6,
        point_for_added = point_for_added - $7
      WHERE player_id = $8 AND hero_id = $9
      RETURNING *
      `,
      [
        add_str,
        add_dex,
        add_int,
        add_con,
        add_faith,
        add_luck,
        totalAdd,
        username,
        hero_id,
      ]
    );

    return res.json({
      isSuccess: true,
      data: update.rows[0],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      isSuccess: false,
      message: "server error",
    });
  }
}
