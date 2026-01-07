import database from "../service/database.js";

export async function getMonster(req, res) {
  try {
    // ไม่ต้องแก้ Query เพราะ m.* จะดึง speed มาเองถ้ามีใน DB
    const result = await database.query(`
      SELECT 
        m.*,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'pattern_no', p.pattern_no,
              'moves', p.moves
            )
            ORDER BY p.pattern_no
          ),
          '[]'
        ) AS monster_moves
      FROM monster m
      LEFT JOIN (
        SELECT 
          monster_id,
          pattern_no,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'pattern_order', pattern_order,
              'pattern_move', pattern_move
            )
            ORDER BY pattern_order
          ) AS moves
        FROM monster_move
        GROUP BY monster_id, pattern_no
      ) p 
        ON p.monster_id = m.id
      GROUP BY m.id
    `);

    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function createMonster(req, res) {
  const {
    id,
    name,
    max_hp,
    atk_power_min,
    atk_power_max,
    description,
    armor,
    exp,
    speed, // [เพิ่ม] รับค่า speed
    monster_moves = []
  } = req.body;

  const client = await database.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ insert monster
    // [แก้ไข] เพิ่ม column speed และ placeholder $9
    await client.query(
      `
      INSERT INTO monster
        (id, name, max_hp, atk_power_min, atk_power_max, description, armor, exp, speed)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [id, name, max_hp, atk_power_min, atk_power_max, description, armor, exp, speed] // [เพิ่ม] speed ใน array
    );

    // 2️⃣ insert monster_move ทั้งก้อน
    for (const pattern of monster_moves) {
      const { pattern_no, moves } = pattern;

      for (const move of moves) {
        await client.query(
          `
          INSERT INTO monster_move
            (monster_id, pattern_no, pattern_order, pattern_move)
          VALUES ($1,$2,$3,$4)
          `,
          [id, pattern_no, move.pattern_order, move.pattern_move]
        );
      }
    }

    await client.query("COMMIT");
    return res.status(201).json({ message: "monster created" });

  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
}

export async function updateMonster(req, res) {
  const {
    name,
    max_hp,
    atk_power_min,
    atk_power_max,
    description,
    armor,
    exp,
    speed, // [เพิ่ม] รับค่า speed
    monster_moves = []
  } = req.body;

  const { id } = req.params;
  const client = await database.connect();

  try {
    await client.query("BEGIN");

    // update monster
    // [แก้ไข] เพิ่ม speed=$8 และขยับ id เป็น $9
    const result = await client.query(
      `
      UPDATE monster SET
        name=$1,
        max_hp=$2,
        atk_power_min=$3,
        atk_power_max=$4,
        description=$5,
        armor=$6,
        exp=$7,
        speed=$8
      WHERE id=$9
      `,
      [name, max_hp, atk_power_min, atk_power_max, description, armor, exp, speed, id] // [เพิ่ม] speed และเรียงลำดับใหม่
    );

    if (result.rowCount === 0) {
      throw new Error("monster not found");
    }

    // ลบ move เก่าทั้งหมด
    await client.query(
      `DELETE FROM monster_move WHERE monster_id = $1`,
      [id]
    );

    // insert move ใหม่
    for (const pattern of monster_moves) {
      for (const move of pattern.moves) {
        await client.query(
          `
          INSERT INTO monster_move 
            (monster_id, pattern_no, pattern_order, pattern_move)
          VALUES ($1,$2,$3,$4)
          `,
          [id, pattern.pattern_no, move.pattern_order, move.pattern_move]
        );
      }
    }

    await client.query("COMMIT");
    return res.status(200).json({ message: "monster updated" });

  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
}

export async function deleteMonster(req, res) {
  // Delete ไม่ต้องทำอะไรเพิ่ม เพราะลบตาม ID
  const { id } = req.params;

  const result = await database.query(
    `DELETE FROM monster WHERE id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ message: "monster not found" });
  }

  return res.status(200).json({ message: "monster deleted" });
}