import database from "../service/database.js";

// GET /server/:id
export async function getServerById(req, res) {
  const id = req.params.id;
  try {
    const result = await database.query(
      `SELECT id, online_count, is_close FROM server WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Server not found" });
    }
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// PATCH /server/:id/toggle
export async function toggleServer(req, res) {
  const id = req.params.id;

  try {
    const result = await database.query(
      `
      UPDATE server
      SET is_close = NOT is_close
      WHERE id = $1
      RETURNING id, online_count, is_close
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Server not found" });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}