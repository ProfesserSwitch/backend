import database from "../service/database.js";

// GET ALL MOVES
export async function getMoves(req, res) {
  console.log(`GET / moves is Requested`);
  try {
    // ปรับชื่อตารางและ column ตามจริง
    const result = await database.query('SELECT * FROM move ORDER BY id ASC');
    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// GET SINGLE MOVE (Optional)
export async function getMoveById(req, res) {
  const id = req.params.id;
  try {
    const result = await database.query('SELECT * FROM move WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Move not found" });
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// POST (CREATE)
export async function postMove(req, res) {
  console.log(`POST / move is Requested`);
  try {
    // รับค่าจากหน้าบ้าน (ปรับตาม field จริง)
    const { name, type, power, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const sql = `
      INSERT INTO move (name, type, power, description)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [name, type, power || 0, description || ''];

    const result = await database.query(sql, values);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// PUT (UPDATE)
export async function updateMove(req, res) {
  console.log(`PUT / move is Requested`);
  const id = req.params.id; // รับ ID ที่จะแก้
  const { name, type, power, description } = req.body;

  try {
    const sql = `
      UPDATE move
      SET name = $1, type = $2, power = $3, description = $4
      WHERE id = $5
      RETURNING *
    `;
    const values = [name, type, power, description, id];

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
  console.log(`DELETE / move is Requested`);
  const id = req.params.id;

  try {
    const result = await database.query('DELETE FROM move WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
        return res.status(404).json({ message: "Move not found" });
    }
    
    return res.status(200).json({ message: "Deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
