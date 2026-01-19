import database from "../service/database.js";

// helper: แปลง undefined -> null (กัน SQL พัง)
const n = (v) => (v === undefined ? null : v);

// GET ALL MOVES
export async function getMoves(req, res) {
  console.log(`GET /moves is Requested`);
  try {
    const result = await database.query(`
      SELECT
        id,
        move_name,
        type,
        is_quiz,
        is_dash,
        power,
        debuff_code,
        debuff_chance,
        debuff_count,
        debuff_turn,
        target
      FROM move
      ORDER BY id ASC
    `);
    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// GET SINGLE MOVE
export async function getMoveById(req, res) {
  const id = req.params.id;
  try {
    const result = await database.query(
      `
      SELECT
        id,
        move_name,
        type,
        is_quiz,
        is_dash,
        power,
        debuff_code,
        debuff_chance,
        debuff_count,
        debuff_turn,
        target
      FROM move
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Move not found" });
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// POST (CREATE)
export async function postMove(req, res) {
  console.log(`POST /moves is Requested`);
  try {
    const {
      id,
      move_name,
      type,
      is_quiz,
      is_dash,
      power,
      debuff_code,
      debuff_chance,
      debuff_count,
      debuff_turn,
      target,
    } = req.body;

    if (!id || !move_name || !type) {
      return res.status(400).json({ message: "id, move_name, type are required" });
    }

    const sql = `
      INSERT INTO move
        (id, move_name, type, is_quiz, is_dash, power, debuff_code, debuff_chance, debuff_count, debuff_turn, target)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      id,
      move_name,
      type,
      n(is_quiz),
      n(is_dash),
      n(power),
      n(debuff_code),
      n(debuff_chance),
      n(debuff_count),
      n(debuff_turn),
      n(target),
    ];

    const result = await database.query(sql, values);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    // กันชนกรณี id ซ้ำ (unique violation)
    if (error.code === "23505") {
      return res.status(409).json({ message: "Move id already exists" });
    }
    return res.status(500).json({ message: error.message });
  }
}

// PUT (UPDATE)  (แก้ตาม id ใน params, ไม่แก้ id)
export async function updateMove(req, res) {
  console.log(`PUT /moves/:id is Requested`);
  const id = req.params.id;

  const {
    move_name,
    type,
    is_quiz,
    is_dash,
    power,
    debuff_code,
    debuff_chance,
    debuff_count,
    debuff_turn,
    target,
  } = req.body;

  try {
    const sql = `
      UPDATE move
      SET
        move_name = $1,
        type = $2,
        is_quiz = $3,
        is_dash = $4,
        power = $5,
        debuff_code = $6,
        debuff_chance = $7,
        debuff_count = $8,
        debuff_turn = $9,
        target = $10
      WHERE id = $11
      RETURNING *
    `;

    const values = [
      n(move_name),
      n(type),
      n(is_quiz),
      n(is_dash),
      n(power),
      n(debuff_code),
      n(debuff_chance),
      n(debuff_count),
      n(debuff_turn),
      n(target),
      id,
    ];

    const result = await database.query(sql, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Move not found to update" });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// DELETE
export async function deleteMove(req, res) {
  console.log(`DELETE /moves/:id is Requested`);
  const id = req.params.id;

  try {
    const result = await database.query("DELETE FROM move WHERE id = $1", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Move not found" });
    }

    return res.status(200).json({ message: "Deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}